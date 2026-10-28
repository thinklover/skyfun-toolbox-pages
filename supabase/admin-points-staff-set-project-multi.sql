-- 專案任務可複選（「、」分隔）；只有黃怡婷、邱奕棋、簡為倢可改
create or replace function public.admin_points_staff_set_project(p_token text, p_name text, p_project text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_me text;
  v_name text := left(trim(coalesce(p_name, '')), 30);
  v_raw text := left(trim(coalesce(p_project, '')), 200);
  v_project text := '';
  v_part text;
  v_allowed text[] := array['清冊＋公會對接', '實價登錄', '續約管理', '包租催收管理'];
  v_seen text[] := array[]::text[];
  v_norm text;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_me from public.toolbox_accounts a where a.id = v_uid;
  if coalesce(v_me, '') = '' then return json_build_object('ok', false, 'error', '帳號沒有姓名'); end if;
  if v_name = '' then return json_build_object('ok', false, 'error', '請指定人員'); end if;
  if not exists (select 1 from public.admin_points_staff where name = v_name) then
    return json_build_object('ok', false, 'error', '人力明細找不到這個人');
  end if;

  if v_me not in ('簡為倢', '邱奕棋', '黃怡婷') then
    return json_build_object('ok', false, 'error', '只有黃怡婷、邱奕棋、簡為倢可以變更專案任務');
  end if;

  v_norm := replace(replace(replace(replace(v_raw, '，', '、'), ',', '、'), '|', '、'), '/', '、');
  foreach v_part in array string_to_array(v_norm, '、') loop
    v_part := trim(v_part);
    if v_part = '' then continue; end if;
    if not (v_part = any (v_allowed)) then
      return json_build_object('ok', false, 'error', '專案任務選項不正確：' || v_part);
    end if;
    if not (v_part = any (v_seen)) then
      v_seen := array_append(v_seen, v_part);
    end if;
  end loop;

  -- 依固定順序輸出，方便前後端一致
  foreach v_part in array v_allowed loop
    if v_part = any (v_seen) then
      v_project := case when v_project = '' then v_part else v_project || '、' || v_part end;
    end if;
  end loop;

  update public.admin_points_staff
     set project = v_project, updated_at = now()
   where name = v_name;

  return json_build_object('ok', true, 'name', v_name, 'project', v_project);
end;
$$;

revoke all on function public.admin_points_staff_set_project(text, text, text) from public;
grant execute on function public.admin_points_staff_set_project(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
