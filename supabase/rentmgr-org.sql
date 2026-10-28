-- 租管師績效中心｜組織人力圖（北／南區）
-- data 格式：{ title, targets:{north,south}, summary:{caseTotal,perCapita,perCapitaMonth}, months:[], groups:[{id,name,people:[]}], note }

create table if not exists public.rentmgr_org_chart (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
alter table public.rentmgr_org_chart enable row level security;
revoke all on public.rentmgr_org_chart from anon, authenticated;

create table if not exists public.rentmgr_org_leave (
  id bigserial primary key,
  name text not null,
  group_name text not null default '',
  city text not null default '',
  title text not null default '',
  joined text not null default '',
  leave_date date not null,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);
alter table public.rentmgr_org_leave enable row level security;
revoke all on public.rentmgr_org_leave from anon, authenticated;

create or replace function public.rentmgr_org_get(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_row public.rentmgr_org_chart%rowtype;
  v_me text;
begin
  v_uid := public.admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select * into v_row from public.rentmgr_org_chart where id = 1;
  begin
    v_me := public.admin_points_spot_me(p_token);
  exception when others then
    v_me := '';
  end;
  return json_build_object(
    'ok', true,
    'data', v_row.data,
    'updatedAt', v_row.updated_at,
    'canEdit', true,
    'me', coalesce(v_me, '')
  );
end;
$$;

create or replace function public.rentmgr_org_user_save(
  p_token text,
  p_data jsonb,
  p_updated_at timestamptz,
  p_leave jsonb default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_me text := '';
  v_cur timestamptz;
  v_at timestamptz;
begin
  v_uid := public.admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  begin
    v_me := coalesce(public.admin_points_spot_me(p_token), '');
  exception when others then
    v_me := '';
  end;
  if v_me = '' then
    v_me := 'toolbox';
  end if;
  if jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(p_data -> 'groups') <> 'array'
     or length(p_data::text) > 200000 then
    return json_build_object('ok', false, 'error', '組織人力圖格式不正確');
  end if;
  select updated_at into v_cur from public.rentmgr_org_chart where id = 1 for update;
  if v_cur is not null and p_updated_at is distinct from v_cur then
    return json_build_object('ok', false, 'error', '組織人力圖剛被其他人改過，請重新整理後再改');
  end if;
  if p_leave is not null then
    if coalesce(trim(p_leave ->> 'name'), '') = '' or (p_leave ->> 'date') is null then
      return json_build_object('ok', false, 'error', '離職要填姓名與離職日');
    end if;
    insert into public.rentmgr_org_leave (name, group_name, city, title, joined, leave_date, created_by)
    values (
      trim(p_leave ->> 'name'),
      coalesce(p_leave ->> 'group', ''),
      coalesce(p_leave ->> 'city', ''),
      coalesce(p_leave ->> 'title', ''),
      coalesce(p_leave ->> 'joined', ''),
      (p_leave ->> 'date')::date,
      v_me
    );
  end if;
  insert into public.rentmgr_org_chart (id, data, updated_at, updated_by)
  values (1, p_data, now(), v_me)
  on conflict (id) do update set
    data = excluded.data,
    updated_at = now(),
    updated_by = excluded.updated_by
  returning updated_at into v_at;
  return json_build_object('ok', true, 'updatedAt', v_at);
end;
$$;

revoke all on function public.rentmgr_org_get(text) from public;
revoke all on function public.rentmgr_org_user_save(text, jsonb, timestamptz, jsonb) from public;
grant execute on function public.rentmgr_org_get(text) to anon, authenticated;
grant execute on function public.rentmgr_org_user_save(text, jsonb, timestamptz, jsonb) to anon, authenticated;
