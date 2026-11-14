-- 財務回報狀態：待處理 submitted／處理中 processing／已結案 closed／已退件 rejected／已補件 resubmitted
alter table public.fin_reports
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by text not null default '';

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
    'handledAt', r.handled_at,
    'handledBy', coalesce(r.handled_by, ''),
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

create or replace function public.fin_report_admin_set_status(
  p_secret text,
  p_id bigint,
  p_status text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_row public.fin_reports;
  v_cur text;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '密碼錯誤');
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

  update public.fin_reports
  set status = v_status,
      handled_at = case when v_status = 'closed' then now() else handled_at end,
      handled_by = case when v_status = 'closed' then '財務後台' else handled_by end
  where id = p_id
  returning * into v_row;

  return json_build_object('ok', true, 'row', public.fin_report_row_json(v_row));
end;
$$;

grant execute on function public.fin_report_admin_set_status(text, bigint, text) to anon, authenticated;

create or replace function public.fin_report_mine(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  return json_build_object(
    'ok', true,
    'rows', coalesce((
      select json_agg(j.obj order by j.created_at desc, j.id desc)
      from (
        select
          r.created_at,
          r.id,
          json_build_object(
            'id', r.id,
            'createdAt', r.created_at,
            'issueType', r.issue_type,
            'status', coalesce(nullif(r.status, ''), 'submitted'),
            'rejectReason', coalesce(r.reject_reason, ''),
            'handledAt', r.handled_at,
            'address', coalesce(nullif(r.payload->>'address', ''), nullif(r.payload->>'clientInfo', ''), ''),
            'item', coalesce(
              nullif(r.payload->>'pkgItem', ''),
              nullif(r.payload->>'payItem', ''),
              nullif(r.payload->>'collectItem', ''),
              nullif(r.payload->>'suppItem', ''),
              nullif(r.payload->>'genItem', ''),
              nullif(r.payload->>'officeItem', ''),
              ''
            )
          ) as obj
        from public.fin_reports r
        where r.user_id = v_uid
        order by r.created_at desc, r.id desc
        limit 80
      ) j
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.fin_report_mine(text) to anon, authenticated;
notify pgrst, 'reload schema';
