-- 財務前台（登入 token）可通過／退件，權限同 fin_report_is_finance
create or replace function public.fin_report_finance_actor_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(a.name), ''), '財務同仁')
  from public.toolbox_accounts a
  where a.id = p_uid
  limit 1;
$$;

create or replace function public.fin_report_finance_set_status(
  p_token text,
  p_id bigint,
  p_status text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_status text := lower(trim(coalesce(p_status, '')));
  v_row public.fin_reports;
  v_cur text;
  v_actor text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  if not public.fin_report_is_finance(v_uid) then
    return json_build_object('ok', false, 'error', '僅財務可視人員可操作');
  end if;
  if p_id is null or p_id <= 0 then
    return json_build_object('ok', false, 'error', '缺少回報序號');
  end if;
  if v_status not in ('processing', 'closed') then
    return json_build_object('ok', false, 'error', '狀態僅能設為 processing 或 closed');
  end if;

  select * into v_row from public.fin_reports where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到此回報單');
  end if;

  v_cur := coalesce(nullif(v_row.status, ''), 'submitted');
  if v_cur = 'rejected' then
    return json_build_object('ok', false, 'error', '已退件案件請走補件流程');
  end if;
  if v_cur = 'closed' and v_status = 'processing' then
    return json_build_object('ok', false, 'error', '已結案不可改回處理中');
  end if;
  if v_status = 'processing' and v_cur not in ('submitted', 'resubmitted', 'processing') then
    return json_build_object('ok', false, 'error', '此狀態無法改為處理中');
  end if;
  if v_status = 'closed' and v_cur not in ('submitted', 'resubmitted', 'processing') then
    return json_build_object('ok', false, 'error', '此狀態無法結案');
  end if;

  v_actor := public.fin_report_finance_actor_name(v_uid);

  update public.fin_reports
  set status = v_status,
      handled_at = case when v_status = 'closed' then now() else handled_at end,
      handled_by = case when v_status = 'closed' then v_actor else handled_by end
  where id = p_id
  returning * into v_row;

  return json_build_object('ok', true, 'row', public.fin_report_row_json(v_row));
end;
$$;

create or replace function public.fin_report_finance_reject(
  p_token text,
  p_id bigint,
  p_reason text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_reason text := left(trim(coalesce(p_reason, '')), 1000);
  v_row public.fin_reports;
  v_actor text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  if not public.fin_report_is_finance(v_uid) then
    return json_build_object('ok', false, 'error', '僅財務可視人員可操作');
  end if;
  if p_id is null or p_id <= 0 then
    return json_build_object('ok', false, 'error', '缺少回報序號');
  end if;
  if v_reason = '' then
    return json_build_object('ok', false, 'error', '請填財務退件原因');
  end if;

  select * into v_row from public.fin_reports where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到此回報單');
  end if;
  if coalesce(v_row.status, 'submitted') = 'rejected' then
    return json_build_object('ok', false, 'error', '此單已退件');
  end if;
  if coalesce(v_row.status, 'submitted') = 'closed' then
    return json_build_object('ok', false, 'error', '已結案不可退件');
  end if;

  v_actor := public.fin_report_finance_actor_name(v_uid);

  update public.fin_reports
  set status = 'rejected',
      reject_reason = v_reason,
      rejected_at = now(),
      rejected_by = v_actor
  where id = p_id
  returning * into v_row;

  return json_build_object('ok', true, 'row', public.fin_report_row_json(v_row));
end;
$$;

grant execute on function public.fin_report_finance_set_status(text, bigint, text) to anon, authenticated;
grant execute on function public.fin_report_finance_reject(text, bigint, text) to anon, authenticated;
revoke all on function public.fin_report_finance_actor_name(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
