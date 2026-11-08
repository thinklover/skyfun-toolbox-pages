-- 誠信險電訪後台：總管密碼刪除單筆
-- 依賴：toolbox_check_admin(p_secret)、biz_coverage_call

create or replace function public.biz_coverage_call_admin_delete(p_secret text, p_match_no text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match text := left(trim(coalesce(p_match_no, '')), 40);
  v_deleted int := 0;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if v_match = '' or char_length(v_match) < 4 then
    return json_build_object('ok', false, 'error', '媒合編號不正確');
  end if;
  delete from public.biz_coverage_call
  where match_no = v_match;
  get diagnostics v_deleted = row_count;
  if v_deleted < 1 then
    return json_build_object('ok', false, 'error', '找不到這筆電訪紀錄');
  end if;
  return json_build_object('ok', true, 'matchNo', v_match, 'deleted', v_deleted);
end;
$$;

revoke all on function public.biz_coverage_call_admin_delete(text, text) from public, anon, authenticated;
grant execute on function public.biz_coverage_call_admin_delete(text, text) to anon, authenticated;
