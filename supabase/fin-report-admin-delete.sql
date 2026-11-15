-- 財務回報後台：總管密碼可刪除案件
-- 不可直接 delete storage.objects（會被擋），附件路徑回傳給前端用 Storage API 刪
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

  -- fin_report_files 有 on delete cascade，刪主檔即可
  delete from public.fin_reports where id = p_id;

  return json_build_object(
    'ok', true,
    'id', p_id,
    'paths', coalesce(to_json(v_paths), '[]'::json)
  );
end;
$$;

grant execute on function public.fin_report_admin_delete(text, bigint) to anon, authenticated;

-- 後台用 Storage API 刪附件（此 bucket 本來就允許 anon 上傳）
drop policy if exists fin_report_anon_delete on storage.objects;
create policy fin_report_anon_delete on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'fin-report');
