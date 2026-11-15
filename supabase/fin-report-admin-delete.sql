-- 財務回報後台：總管密碼可刪除案件（含附件檔案）
-- 2026-11-16

create or replace function public.fin_report_admin_delete(p_secret text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fin_reports;
  v_paths text[];
  v_removed int := 0;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '密碼錯誤');
  end if;
  if p_id is null or p_id <= 0 then
    return json_build_object('ok', false, 'error', '缺少回報序號');
  end if;

  select * into v_row from public.fin_reports where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到此回報單');
  end if;

  select coalesce(array_agg(nullif(trim(f.path), '')), '{}'::text[])
  into v_paths
  from public.fin_report_files f
  where f.report_id = p_id
    and nullif(trim(f.path), '') is not null;

  if v_paths is not null and cardinality(v_paths) > 0 then
    delete from storage.objects o
    where o.bucket_id = 'fin-report'
      and o.name = any (v_paths);
    get diagnostics v_removed = row_count;
  end if;

  delete from public.fin_reports where id = p_id;

  return json_build_object('ok', true, 'id', p_id, 'filesRemoved', v_removed);
end;
$$;

grant execute on function public.fin_report_admin_delete(text, bigint) to anon, authenticated;
