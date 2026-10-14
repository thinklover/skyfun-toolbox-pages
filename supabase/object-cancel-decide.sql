-- 星鴻註銷物件申請：審核改成「同意解編」(done)／「不同意解編」(rejected)，決定後 LINE 通知送件的行政（送出申請的工具箱帳號）

alter table public.object_cancel_requests
  add column if not exists decision_line_at timestamptz,
  add column if not exists decision_line_error text not null default '';

drop function if exists public.object_cancel_reject(text, bigint, boolean, text);

/** LINE 通知送件人審核結果；回傳 { recipients, error } */
create or replace function public.object_cancel_notify_decision(p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  r public.object_cancel_requests%rowtype;
  v_token text;
  v_to text[];
  v_msg text;
  v_err text := '';
begin
  select * into r from public.object_cancel_requests where id = p_id;
  if not found or r.status not in ('done', 'rejected') then return json_build_object('recipients', 0, 'error', '尚未審核'); end if;

  select value into v_token from public.line_settings where key = 'channel_access_token';
  select array_agg(distinct b.line_user_id) into v_to
  from public.line_bindings b where b.user_id = r.user_id and coalesce(b.line_user_id, '') <> '';

  if coalesce(v_token, '') = '' then v_err := 'LINE 尚未設定';
  elsif v_to is null then v_err := '送件人尚未綁定 LINE';
  end if;

  if v_err = '' then
    v_msg := format(E'%s 星鴻註銷物件申請結果：%s\n%s 您好：\n您 %s 送出的註銷申請已審核。\n\n📍 %s\n申請：%s・%s\n審核：%s（%s）%s\n\n詳情請到工具箱「行政專區 → 星鴻註銷物件申請」查看。',
      case when r.status = 'done' then '✅' else '❌' end,
      case when r.status = 'done' then '同意解編' else '不同意解編' end,
      coalesce(nullif(r.user_name, ''), r.username),
      to_char(r.created_at at time zone 'Asia/Taipei', 'FMMM/FMDD'),
      r.address, r.dept, r.applicant,
      coalesce(nullif(r.done_by_name, ''), '—'),
      to_char(r.handled_at at time zone 'Asia/Taipei', 'FMMM/FMDD HH24:MI'),
      case when coalesce(r.admin_note, '') = '' then ''
           else format(E'\n%s：%s', case when r.status = 'done' then '備註' else '不同意原因' end, r.admin_note) end);
    perform net.http_post(
      url := 'https://api.line.me/v2/bot/message/multicast',
      body := jsonb_build_object('to', to_jsonb(v_to), 'messages', jsonb_build_array(jsonb_build_object('type', 'text', 'text', left(v_msg, 4900)))),
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Content-Type', 'application/json'));
  end if;

  update public.object_cancel_requests
  set decision_line_at = case when v_err = '' then now() else decision_line_at end, decision_line_error = v_err
  where id = p_id;
  return json_build_object('recipients', case when v_err = '' then array_length(v_to, 1) else 0 end, 'error', v_err);
end; $$;
revoke all on function public.object_cancel_notify_decision(bigint) from public, anon, authenticated;

/** 登入者審核：approve＝同意解編、reject＝不同意解編（必填原因）、reset＝撤銷決定回到未完成 */
create or replace function public.object_cancel_decide(p_token text, p_id bigint, p_decision text, p_note text default '')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_row public.object_cancel_requests%rowtype; v_note text; v_line json;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if p_decision not in ('approve', 'reject', 'reset') then return json_build_object('ok', false, 'error', '審核動作不正確'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;
  v_note := left(trim(coalesce(p_note, '')), 1000);
  if p_decision = 'reject' and v_note = '' then return json_build_object('ok', false, 'error', '請填寫不同意的原因'); end if;

  select * into v_row from public.object_cancel_requests where id = p_id for update;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆申請'); end if;
  if p_decision <> 'reset' and v_row.status <> 'pending' then return json_build_object('ok', false, 'error', '這筆申請已經審核過了，請先撤銷決定'); end if;
  if p_decision = 'reset' and v_row.status = 'pending' then return json_build_object('ok', false, 'error', '這筆申請還沒審核'); end if;

  update public.object_cancel_requests set
    status = case p_decision when 'approve' then 'done' when 'reject' then 'rejected' else 'pending' end,
    admin_note = case when p_decision = 'reset' then '' else v_note end,
    handled_at = case when p_decision = 'reset' then null else now() end,
    done_by = case when p_decision = 'reset' then null else v_uid end,
    done_by_name = case when p_decision = 'reset' then '' else coalesce(nullif(v_acc.name, ''), v_acc.username, '') end,
    decision_line_at = case when p_decision = 'reset' then null else decision_line_at end,
    decision_line_error = ''
  where id = p_id
  returning * into v_row;

  if p_decision <> 'reset' then v_line := public.object_cancel_notify_decision(p_id); end if;
  return json_build_object('ok', true, 'status', v_row.status, 'handledAt', v_row.handled_at, 'doneByName', v_row.done_by_name,
    'lineRecipients', coalesce((v_line ->> 'recipients')::int, 0), 'lineError', coalesce(v_line ->> 'error', ''));
end; $$;
grant execute on function public.object_cancel_decide(text, bigint, text, text) to anon, authenticated;

/** 後台改狀態：同意／不同意時也通知送件人 */
create or replace function public.object_cancel_admin_update(p_secret text, p_id bigint, p_status text, p_admin_note text default '')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_row public.object_cancel_requests%rowtype; v_old text; v_line json;
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  if p_status not in ('pending', 'done', 'rejected') then return json_build_object('ok', false, 'error', '狀態不正確'); end if;
  select status into v_old from public.object_cancel_requests where id = p_id;
  update public.object_cancel_requests set
    status = p_status,
    admin_note = left(trim(coalesce(p_admin_note, '')), 1000),
    handled_at = case when p_status = 'pending' then null when status = p_status then handled_at else now() end,
    done_by = case when p_status = status then done_by else null end,
    done_by_name = case when p_status = status then done_by_name when p_status = 'pending' then '' else '後台' end
  where id = p_id
  returning * into v_row;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆申請'); end if;
  if p_status in ('done', 'rejected') and v_old is distinct from p_status then v_line := public.object_cancel_notify_decision(p_id); end if;
  return json_build_object('ok', true, 'status', v_row.status, 'handledAt', v_row.handled_at,
    'lineRecipients', coalesce((v_line ->> 'recipients')::int, 0), 'lineError', coalesce(v_line ->> 'error', ''));
end; $$;

create or replace function public.object_cancel_items_json(p_query text, p_status text, p_limit integer)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select r.id, r.username, r.user_name as "userName", r.team, r.dept, r.applicant, r.agent_name as "agentName",
      r.region, r.object_type as "objectType", r.contract_status as "contractStatus", r.lease_start as "leaseStart",
      r.lease_end as "leaseEnd", r.address, r.note, r.taker_company as "takerCompany", r.taker_agent as "takerAgent",
      r.status, r.admin_note as "adminNote", r.handled_at as "handledAt", r.done_by_name as "doneByName",
      r.created_at as "createdAt", r.line_notified_at as "lineNotifiedAt", r.line_error as "lineError",
      r.decision_line_at as "decisionLineAt", r.decision_line_error as "decisionLineError",
      (select count(*) from public.object_cancel_files f where f.request_id = r.id) as "fileCount"
    from public.object_cancel_requests r
    where (coalesce(p_status, '') = '' or r.status = p_status)
      and (coalesce(trim(p_query), '') = ''
        or r.address ilike '%' || trim(p_query) || '%' or r.applicant ilike '%' || trim(p_query) || '%'
        or r.agent_name ilike '%' || trim(p_query) || '%' or r.dept ilike '%' || trim(p_query) || '%'
        or r.user_name ilike '%' || trim(p_query) || '%' or r.taker_company ilike '%' || trim(p_query) || '%'
        or r.taker_agent ilike '%' || trim(p_query) || '%')
    order by r.created_at desc
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  ) x;
$$;
