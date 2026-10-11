-- 行政專區「全台行政組織與人力配置」：整份組織圖存成一筆 JSON，後台（admin-points-dashboard 的「組織圖」）可編輯
-- data 格式：{ title, lead:[{role,name}], groups:[{name,lead,people:[{status,name,dept,joined,office,deputy}]}], note }

create table if not exists public.admin_org_chart (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
alter table public.admin_org_chart enable row level security;
revoke all on public.admin_org_chart from anon, authenticated;

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
  return json_build_object('ok', true, 'data', v_row.data, 'updatedAt', v_row.updated_at);
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
  return json_build_object('ok', true, 'data', v_row.data, 'updatedAt', v_row.updated_at);
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
  return json_build_object('ok', true, 'updatedAt', v_at);
end;
$$;

grant execute on function public.admin_org_get(text) to anon, authenticated;
grant execute on function public.admin_org_admin_get(text) to anon, authenticated;
grant execute on function public.admin_org_admin_save(text, jsonb) to anon, authenticated;
