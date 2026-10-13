-- 後台「管理部KPI月報」：每年一筆，data = { rows: { 指標key: { months: { "1": { last, target, actual, weeks:[] } } } } }
-- 數值為比例（0.9 = 90%），null 表示沒有資料；行政四項的實績可在後台從星鴻資料帶入
create table if not exists public.admin_kpi_annual (
  year int primary key check (year between 2020 and 2100),
  data jsonb not null default '{"rows":{}}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.admin_kpi_annual enable row level security;
revoke all on public.admin_kpi_annual from public, anon, authenticated;

create or replace function public.admin_kpi_annual_get(p_secret text, p_year int)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare r public.admin_kpi_annual;
begin
  if not public.toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  select * into r from public.admin_kpi_annual where year = p_year;
  return json_build_object('ok', true, 'year', p_year, 'data', coalesce(r.data, '{"rows":{}}'::jsonb), 'updatedAt', r.updated_at);
end;
$$;

create or replace function public.admin_kpi_annual_save(p_secret text, p_year int, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  if p_year is null or p_year < 2020 or p_year > 2100 then return json_build_object('ok', false, 'error', '年度錯誤'); end if;
  if p_data is null or jsonb_typeof(p_data->'rows') <> 'object' then return json_build_object('ok', false, 'error', '資料格式錯誤'); end if;
  if length(p_data::text) > 200000 then return json_build_object('ok', false, 'error', '資料太大'); end if;
  insert into public.admin_kpi_annual (year, data, updated_at) values (p_year, p_data, now())
  on conflict (year) do update set data = excluded.data, updated_at = now();
  return json_build_object('ok', true, 'updatedAt', now());
end;
$$;

revoke all on function public.admin_kpi_annual_get(text, int) from public;
revoke all on function public.admin_kpi_annual_save(text, int, jsonb) from public;
grant execute on function public.admin_kpi_annual_get(text, int) to anon, authenticated;
grant execute on function public.admin_kpi_annual_save(text, int, jsonb) to anon, authenticated;
