-- 組織圖改部別／營業處時，同步到人力明細（個人點數／成長羅盤用）

create or replace function public.admin_org_sync_staff_from_chart(p_data jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := 0;
  r record;
begin
  if jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'groups') <> 'array' then
    return 0;
  end if;

  for r in
    select trim(p->>'name') as name,
           trim(coalesce(p->>'dept', '')) as dept,
           trim(coalesce(p->>'office', '')) as office
    from jsonb_array_elements(p_data -> 'groups') g
    cross join lateral jsonb_array_elements(coalesce(g->'people', '[]'::jsonb)) p
    where coalesce(trim(p->>'status'), '') = '在職'
      and coalesce(trim(p->>'name'), '') <> ''
  loop
    update public.admin_points_staff s
       set region = r.dept,
           office = r.office
     where s.name = r.name
       and (s.region is distinct from r.dept or s.office is distinct from r.office);
    if found then
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end;
$$;

revoke all on function public.admin_org_sync_staff_from_chart(jsonb) from public, anon, authenticated;

create or replace function public.admin_org_user_save(p_token text, p_data jsonb, p_updated_at timestamptz, p_leave jsonb default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := public.admin_org_editor(p_token);
  v_cur timestamptz;
  v_at timestamptz;
  v_synced int := 0;
begin
  if v_me is null then
    return json_build_object('ok', false, 'error', '沒有修改組織圖的權限');
  end if;
  if jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'groups') <> 'array'
     or jsonb_typeof(coalesce(p_data -> 'lead', '[]'::jsonb)) <> 'array' or length(p_data::text) > 100000 then
    return json_build_object('ok', false, 'error', '組織圖格式不正確');
  end if;
  select updated_at into v_cur from public.admin_org_chart where id = 1 for update;
  if v_cur is not null and p_updated_at is distinct from v_cur then
    return json_build_object('ok', false, 'error', '組織圖剛被其他人改過，請重新整理後再改');
  end if;
  if p_leave is not null then
    if coalesce(trim(p_leave ->> 'name'), '') = '' or (p_leave ->> 'date') is null then
      return json_build_object('ok', false, 'error', '離職要填姓名與離職日');
    end if;
    insert into public.admin_org_leave (name, group_name, dept, office, joined, leave_date, created_by)
    values (trim(p_leave ->> 'name'), coalesce(p_leave ->> 'group', ''), coalesce(p_leave ->> 'dept', ''),
      coalesce(p_leave ->> 'office', ''), coalesce(p_leave ->> 'joined', ''), (p_leave ->> 'date')::date, v_me);
  end if;
  insert into public.admin_org_chart (id, data, updated_at, updated_by)
  values (1, p_data, now(), v_me)
  on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by
  returning updated_at into v_at;

  v_synced := public.admin_org_sync_staff_from_chart(p_data);

  return json_build_object('ok', true, 'updatedAt', v_at, 'staffSynced', v_synced);
end;
$$;

create or replace function public.admin_org_admin_save(p_secret text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
  v_synced int := 0;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'groups') <> 'array'
     or jsonb_typeof(coalesce(p_data -> 'lead', '[]'::jsonb)) <> 'array' or length(p_data::text) > 100000 then
    return json_build_object('ok', false, 'error', '組織圖格式不正確');
  end if;
  insert into public.admin_org_chart (id, data, updated_at, updated_by)
  values (1, p_data, now(), '後台')
  on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by
  returning updated_at into v_at;

  v_synced := public.admin_org_sync_staff_from_chart(p_data);

  return json_build_object('ok', true, 'updatedAt', v_at, 'staffSynced', v_synced);
end;
$$;

grant execute on function public.admin_org_user_save(text, jsonb, timestamptz, jsonb) to anon, authenticated;
grant execute on function public.admin_org_admin_save(text, jsonb) to anon, authenticated;

-- 立刻對齊組織圖 → 人力明細（含王思涵／呂佳融）
select public.admin_org_sync_staff_from_chart((select data from public.admin_org_chart where id = 1));
