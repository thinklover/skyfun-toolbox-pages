-- 組織圖「在職」→ 人力明細：沒有的人要新增（新人進行政明細後，點數表才會算行政）
-- 既有的人同步部別／營業處／在職狀態／組長／到職日（到職日僅在人力明細空白時補）

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

-- 立刻對齊（含楊欣瑜等組織圖有、人力明細沒有的在職行政）
select public.admin_org_sync_staff_from_chart((select data from public.admin_org_chart where id = 1));
