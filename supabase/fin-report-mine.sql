-- 填單人只看自己送出的財務案件與進度（不含附件網址）
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
