-- 財務退件：LINE 通知填寫人；補件後原單改 resubmitted，會回到財務待處理

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
  v_notify_name text;
  v_addr text;
  v_msg text;
  v_line json;
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

  v_notify_name := trim(coalesce(nullif(v_row.full_name, ''), nullif(v_row.user_name, ''), ''));
  v_addr := left(trim(coalesce(v_row.payload->>'address', '')), 80);
  v_msg := format(
    E'↩️ 財務回報已退件\n序號：#%s\n類型：%s\n地址：%s\n退件原因：%s\n請至工具箱「財會專區 → 補件與資料查詢」補件後重新送出；送出後會回到財務待處理。\nhttps://toolbox.skyfunsystem.com/',
    v_row.id,
    coalesce(v_row.issue_type, ''),
    case when v_addr = '' then '（無地址）' else v_addr end,
    v_reason
  );
  if v_notify_name <> '' then
    begin
      v_line := public.admin_points_line_push(v_notify_name, v_msg);
    exception when others then
      v_line := json_build_object('recipients', 0, 'error', sqlerrm);
    end;
  else
    v_line := json_build_object('recipients', 0, 'error', '找不到填寫人姓名');
  end if;

  return json_build_object(
    'ok', true,
    'row', public.fin_report_row_json(v_row),
    'line', v_line
  );
end;
$$;

notify pgrst, 'reload schema';
