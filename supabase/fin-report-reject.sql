-- 財務退件狀態＋以地址查退件／補件驗證
alter table public.fin_reports
  add column if not exists status text not null default 'submitted',
  add column if not exists reject_reason text not null default '',
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by text not null default '';

update public.fin_reports set status = 'submitted' where coalesce(status, '') = '';

create or replace function public.fin_report_row_json(r public.fin_reports)
returns json
language sql
stable
as $$
  select json_build_object(
    'id', r.id,
    'createdAt', r.created_at,
    'userName', r.user_name,
    'fullName', r.full_name,
    'office', r.office,
    'issueType', r.issue_type,
    'payload', r.payload,
    'lineError', r.line_error,
    'lineRecipients', r.line_recipients,
    'status', coalesce(nullif(r.status, ''), 'submitted'),
    'rejectReason', coalesce(r.reject_reason, ''),
    'rejectedAt', r.rejected_at,
    'rejectedBy', coalesce(r.rejected_by, ''),
    'files', coalesce((
      select json_agg(json_build_object(
        'id', f.id,
        'name', f.name,
        'kind', f.kind,
        'url', f.public_url
      ) order by f.id)
      from public.fin_report_files f
      where f.report_id = r.id
    ), '[]'::json)
  );
$$;

create or replace function public.fin_report_admin_reject(p_secret text, p_id bigint, p_reason text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := left(trim(coalesce(p_reason, '')), 1000);
  v_row public.fin_reports;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '密碼錯誤');
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
  update public.fin_reports
  set status = 'rejected',
      reject_reason = v_reason,
      rejected_at = now(),
      rejected_by = '財務後台'
  where id = p_id
  returning * into v_row;
  return json_build_object('ok', true, 'row', public.fin_report_row_json(v_row));
end;
$$;

drop function if exists public.fin_report_lookup_rejected(text, bigint);

create or replace function public.fin_report_lookup_rejected(p_token text, p_address text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_q text := left(trim(coalesce(p_address, '')), 120);
  v_norm text;
  v_rows json;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  if length(v_q) < 2 then
    return json_build_object('ok', false, 'error', '請輸入物件地址（至少 2 字）');
  end if;
  v_norm := replace(lower(v_q), '臺', '台');
  v_norm := regexp_replace(v_norm, '\s+', '', 'g');

  select coalesce(json_agg(x.obj order by x.rejected_at desc nulls last, x.id desc), '[]'::json)
    into v_rows
  from (
    select
      r.id,
      r.rejected_at,
      json_build_object(
        'id', r.id,
        'issueType', r.issue_type,
        'fullName', r.full_name,
        'office', r.office,
        'address', coalesce(r.payload->>'address', ''),
        'landlord', coalesce(r.payload->>'landlord', ''),
        'tenant', coalesce(r.payload->>'tenant', ''),
        'rejectReason', coalesce(r.reject_reason, ''),
        'rejectedAt', r.rejected_at,
        'rejectedBy', coalesce(r.rejected_by, ''),
        'status', r.status,
        'createdAt', r.created_at
      ) as obj
    from public.fin_reports r
    where coalesce(r.status, 'submitted') = 'rejected'
      and position(
        v_norm in
        regexp_replace(replace(lower(coalesce(r.payload->>'address', '')), '臺', '台'), '\s+', '', 'g')
      ) > 0
    order by r.rejected_at desc nulls last, r.id desc
    limit 50
  ) x;

  if v_rows is null or v_rows = '[]'::json then
    return json_build_object('ok', false, 'error', '找不到此地址的財務退件案件', 'rows', '[]'::json);
  end if;

  return json_build_object('ok', true, 'rows', v_rows);
end;
$$;

grant execute on function public.fin_report_admin_reject(text, bigint, text) to anon, authenticated;
grant execute on function public.fin_report_lookup_rejected(text, text) to anon, authenticated;
