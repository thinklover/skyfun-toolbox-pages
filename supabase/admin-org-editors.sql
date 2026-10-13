-- 組織圖前台編輯：指定主管登入工具箱後可以直接在行政專區改組織圖；改成離職要記離職日（後台看得到）
-- 依賴 admin-org.sql、admin_points_spot_me(p_token)

create table if not exists public.admin_org_leave (
  id bigserial primary key,
  name text not null,
  group_name text not null default '',
  dept text not null default '',
  office text not null default '',
  joined text not null default '',
  leave_date date not null,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);
alter table public.admin_org_leave enable row level security;
revoke all on public.admin_org_leave from anon, authenticated;

create or replace function public.admin_org_editor(p_token text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me text := public.admin_points_spot_me(p_token);
begin
  if v_me = any (array['邱奕棋', '黃怡婷', '簡為倢', '李芷琳', '侯思廷']) then
    return v_me;
  end if;
  return null;
end;
$$;

create or replace function public.admin_org_get(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.admin_org_chart%rowtype;
begin
  if public.admin_qa_user_id(p_token) is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select * into v_row from public.admin_org_chart where id = 1;
  return json_build_object('ok', true, 'data', v_row.data, 'updatedAt', v_row.updated_at,
    'canEdit', public.admin_org_editor(p_token) is not null);
end;
$$;

-- p_updated_at：前台讀到的版本時間，跟資料庫不同表示別人先改過，要重新整理
-- p_leave：{ name, group, dept, office, joined, date }，改成離職時才帶
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
  return json_build_object('ok', true, 'updatedAt', v_at);
end;
$$;

create or replace function public.admin_org_admin_get(p_secret text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.admin_org_chart%rowtype;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  select * into v_row from public.admin_org_chart where id = 1;
  return json_build_object('ok', true, 'data', v_row.data, 'updatedAt', v_row.updated_at, 'updatedBy', v_row.updated_by,
    'leaves', coalesce((select json_agg(json_build_object('name', l.name, 'group', l.group_name, 'dept', l.dept, 'office', l.office,
        'joined', l.joined, 'date', l.leave_date, 'by', l.created_by, 'at', l.created_at) order by l.leave_date desc, l.id desc)
      from (select * from public.admin_org_leave order by leave_date desc, id desc limit 300) l), '[]'::json));
end;
$$;

revoke execute on function public.admin_org_editor(text) from public, anon, authenticated;
grant execute on function public.admin_org_get(text) to anon, authenticated;
grant execute on function public.admin_org_user_save(text, jsonb, timestamptz, jsonb) to anon, authenticated;
grant execute on function public.admin_org_admin_get(text) to anon, authenticated;
