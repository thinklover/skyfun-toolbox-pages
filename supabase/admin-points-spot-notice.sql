-- 小組長抽查未通過：當下用 LINE 通知該行政（要先在工具箱綁定星鴻萬能小幫手），並在工具箱首頁顯示，行政按「我知道了」才收起。
-- 同一件改判：原因改了會再通知一次（舊通知收起）；改判通過會收起通知，若之前有推過 LINE 再補一則「改判通過」。

create table if not exists public.admin_points_spot_notice (
  id bigserial primary key,
  check_id bigint references public.admin_points_check(id) on delete cascade,
  spot_key text not null,
  staff_name text not null,
  work_date date not null,
  node text not null default '',
  case_text text not null default '',
  reason text not null default '',
  judged_by text not null default '',
  created_at timestamptz not null default now(),
  recipients int not null default 0,
  net_request_id bigint,
  line_error text not null default '',
  read_at timestamptz,
  cleared_at timestamptz
);
create index if not exists admin_points_spot_notice_staff_idx on public.admin_points_spot_notice (staff_name, created_at desc);
create index if not exists admin_points_spot_notice_key_idx on public.admin_points_spot_notice (spot_key);
alter table public.admin_points_spot_notice enable row level security;
revoke all on table public.admin_points_spot_notice from public, anon, authenticated;

/** 依工具箱帳號姓名推一則 LINE；回傳 { recipients, error, req } */
create or replace function public.admin_points_line_push(p_name text, p_msg text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_to text[];
  v_req bigint;
begin
  select value into v_token from public.line_settings where key = 'channel_access_token';
  if coalesce(v_token, '') = '' then
    return json_build_object('recipients', 0, 'error', 'LINE 尚未設定');
  end if;
  select array_agg(distinct b.line_user_id) into v_to
  from public.line_bindings b join public.toolbox_accounts a on a.id = b.user_id
  where trim(coalesce(nullif(a.name, ''), a.username)) = trim(p_name) and coalesce(b.line_user_id, '') <> '';
  if v_to is null then
    return json_build_object('recipients', 0, 'error', '尚未綁定 LINE');
  end if;
  select net.http_post(
    url := 'https://api.line.me/v2/bot/message/multicast',
    body := jsonb_build_object('to', to_jsonb(v_to), 'messages', jsonb_build_array(jsonb_build_object('type', 'text', 'text', left(p_msg, 4900)))),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Content-Type', 'application/json')
  ) into v_req;
  return json_build_object('recipients', array_length(v_to, 1), 'error', '', 'req', v_req);
end;
$$;
revoke all on function public.admin_points_line_push(text, text) from public, anon, authenticated;

create or replace function public.admin_points_spot_check(
  p_token text,
  p_name text,
  p_date date,
  p_key text,
  p_node text,
  p_case text,
  p_passed boolean,
  p_reason text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_me text;
  v_name text := trim(coalesce(p_name, ''));
  v_key text := left(trim(coalesce(p_key, '')), 200);
  v_node text := left(trim(coalesce(p_node, '')), 20);
  v_case text := left(trim(coalesce(p_case, '')), 100);
  v_reason text := left(trim(coalesce(p_reason, '')), 150);
  v_leader text;
  v_note text;
  v_prev_note text;
  v_id bigint;
  v_push json;
  v_notice json;
  v_sent int;
  v_url text := 'https://toolbox.skyfunsystem.com/';
begin
  v_uid := public.admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_me from public.toolbox_accounts a where a.id = v_uid;
  select s.leader into v_leader from public.admin_points_staff s where s.name = v_name;
  if not found then
    return json_build_object('ok', false, 'error', '人力明細查無此人');
  end if;
  if not (v_me in ('簡為倢', '邱奕棋', '黃怡婷') or v_me = trim(coalesce(v_leader, ''))) then
    return json_build_object('ok', false, 'error', '只有這位行政的組長可以登錄抽查結果');
  end if;
  if p_date is null or v_key = '' then
    return json_build_object('ok', false, 'error', '抽查案件資料不完整');
  end if;
  if p_passed is null then
    return json_build_object('ok', false, 'error', '請選通過或未通過');
  end if;
  if not p_passed and v_reason = '' then
    return json_build_object('ok', false, 'error', '未通過請填寫原因');
  end if;
  select c.note into v_prev_note from public.admin_points_check c where c.spot_key = v_key;
  v_note := left(concat_ws('｜', '小組長抽查', nullif(v_node, ''), nullif(v_case, ''),
    case when p_passed then '通過' else '未通過：' || v_reason end), 200);
  insert into public.admin_points_check (work_date, staff_name, checked, correct, note, created_by, spot_key, spot_node)
  values (p_date, v_name, 1, case when p_passed then 1 else 0 end, v_note,
          public.admin_qa_reviewer_label(p_token), v_key, v_node)
  on conflict (spot_key) where spot_key is not null do update
    set correct = excluded.correct, note = excluded.note, created_by = excluded.created_by, created_at = now()
  returning id into v_id;

  if p_passed then
    select coalesce(sum(n.recipients), 0)::int into v_sent from public.admin_points_spot_notice n
    where n.spot_key = v_key and n.cleared_at is null;
    update public.admin_points_spot_notice set cleared_at = now() where spot_key = v_key and cleared_at is null;
    if v_sent > 0 then
      v_push := public.admin_points_line_push(v_name, format(E'✅ 抽查改判通過\n%s 您好：\n您 %s 審核的案件（%s%s）已由 %s 改判為「通過」，先前的未通過通知可以忽略。',
        v_name, to_char(p_date, 'FMMM/FMDD'), coalesce(nullif(v_node, '') || '｜', ''), coalesce(nullif(v_case, ''), '—'), v_me));
      v_notice := json_build_object('kind', 'cleared', 'recipients', v_push ->> 'recipients', 'error', v_push ->> 'error');
    end if;
  elsif v_prev_note is distinct from v_note then
    update public.admin_points_spot_notice set cleared_at = now() where spot_key = v_key and cleared_at is null;
    v_push := public.admin_points_line_push(v_name, format(
      E'❌ 小組長抽查未通過\n%s 您好：\n%s 抽查您 %s 審核的案件，結果未通過。\n節點：%s\n案件：%s\n原因：%s\n\n請到工具箱首頁查看並按「我知道了」；有疑問請直接找組長確認。\n%s',
      v_name, v_me, to_char(p_date, 'FMMM/FMDD'), coalesce(nullif(v_node, ''), '—'), coalesce(nullif(v_case, ''), '—'), v_reason, v_url));
    insert into public.admin_points_spot_notice (check_id, spot_key, staff_name, work_date, node, case_text, reason, judged_by, recipients, net_request_id, line_error)
    values (v_id, v_key, v_name, p_date, v_node, v_case, v_reason, v_me,
            coalesce((v_push ->> 'recipients')::int, 0), (v_push ->> 'req')::bigint, coalesce(v_push ->> 'error', ''));
    v_notice := json_build_object('kind', 'fail', 'recipients', (v_push ->> 'recipients')::int, 'error', v_push ->> 'error');
  end if;
  return json_build_object('ok', true, 'id', v_id, 'note', v_note, 'notice', v_notice);
end;
$$;

revoke all on function public.admin_points_spot_check(text, text, date, text, text, text, boolean, text) from public;
grant execute on function public.admin_points_spot_check(text, text, date, text, text, text, boolean, text) to anon, authenticated;

/** 工具箱首頁：登入者自己的抽查未通過通知（近 60 天、未改判通過），沒按「我知道了」的排前面 */
create or replace function public.admin_points_spot_notices(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me text := public.admin_points_spot_me(p_token);
begin
  if v_me is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  return json_build_object('ok', true, 'notices', coalesce((
    select json_agg(json_build_object(
      'id', n.id, 'date', n.work_date, 'node', n.node, 'case', n.case_text, 'reason', n.reason,
      'judgedBy', n.judged_by, 'createdAt', n.created_at, 'readAt', n.read_at
    ) order by n.read_at is not null, n.created_at desc)
    from (
      select * from public.admin_points_spot_notice
      where staff_name = v_me and cleared_at is null and created_at > now() - interval '60 days'
      order by read_at is not null, created_at desc
      limit 30
    ) n
  ), '[]'::json));
end;
$$;
revoke all on function public.admin_points_spot_notices(text) from public;
grant execute on function public.admin_points_spot_notices(text) to anon, authenticated;

/** 行政按「我知道了」 */
create or replace function public.admin_points_spot_notice_read(p_token text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := public.admin_points_spot_me(p_token);
begin
  if v_me is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  update public.admin_points_spot_notice set read_at = now()
  where id = p_id and staff_name = v_me and read_at is null;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.admin_points_spot_notice_read(text, bigint) from public;
grant execute on function public.admin_points_spot_notice_read(text, bigint) to anon, authenticated;
