-- 組織圖「在職」→ 人力明細：沒有的人新增、有的人同步部別／營業處／在職／組長／到職日
-- （新人進行政明細後，點數表才會算行政，不會落在非行政）
-- 完整定義見 admin-org-sync-staff-insert.sql

create or replace function public.admin_org_joined_to_date(p_joined text)
returns date
language plpgsql
immutable
as $$
declare
  m text[];
  y int;
  mo int;
  d int;
begin
  m := regexp_match(trim(coalesce(p_joined, '')), '(\d+)\s*年\s*(\d+)\s*月(?:\s*(\d+)\s*日?)?');
  if m is null then
    return null;
  end if;
  y := m[1]::int + 1911;
  mo := m[2]::int;
  d := coalesce(nullif(m[3], '')::int, 1);
  if mo < 1 or mo > 12 or d < 1 or d > 31 then
    return null;
  end if;
  return make_date(y, mo, d);
exception
  when others then
    return null;
end;
$$;

revoke all on function public.admin_org_joined_to_date(text) from public;
grant execute on function public.admin_org_joined_to_date(text) to anon, authenticated;

create or replace function public.admin_org_sync_staff_from_chart(p_data jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := 0;
  r record;
  v_kind text;
  v_hire date;
  v_office text;
begin
  if jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'groups') <> 'array' then
    return 0;
  end if;

  for r in
    select trim(p->>'name') as name,
           trim(coalesce(p->>'dept', '')) as dept,
           trim(coalesce(p->>'office', '')) as office,
           trim(coalesce(p->>'joined', '')) as joined,
           trim(coalesce(g->>'lead', '')) as leader
    from jsonb_array_elements(p_data -> 'groups') g
    cross join lateral jsonb_array_elements(coalesce(g->'people', '[]'::jsonb)) p
    where coalesce(trim(p->>'status'), '') = '在職'
      and coalesce(trim(p->>'name'), '') <> ''
      and coalesce(trim(p->>'name'), '') !~ '^(待補|從缺)$'
  loop
    v_office := left(r.office, 80);
    v_kind := case when v_office = '工讀生' then '工讀生' else '正職' end;
    v_hire := public.admin_org_joined_to_date(r.joined);

    insert into public.admin_points_staff as s
      (name, status, kind, note, region, office, hire_date, project, leader)
    values
      (r.name, '在職', v_kind, '', left(r.dept, 40), v_office, v_hire, '', left(r.leader, 30))
    on conflict (name) do update
      set status = '在職',
          kind = excluded.kind,
          region = excluded.region,
          office = excluded.office,
          hire_date = coalesce(s.hire_date, excluded.hire_date),
          leader = case
            when excluded.leader <> '' then excluded.leader
            else s.leader
          end,
          updated_at = now()
    where s.status is distinct from '在職'
       or s.kind is distinct from excluded.kind
       or s.region is distinct from excluded.region
       or s.office is distinct from excluded.office
       or (s.hire_date is null and excluded.hire_date is not null)
       or (excluded.leader <> '' and s.leader is distinct from excluded.leader);

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
