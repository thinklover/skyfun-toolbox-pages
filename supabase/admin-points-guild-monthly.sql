-- 公會良率月報：後台貼上公會月報（繳件數、退件數、下意見數，本期＋同期），
-- 前台「公會審件／清冊良率」年度折線圖用；有填的月份以填的為準，沒填的月份由系統（表單04/07、案件、公會意見）計算。
-- 審件良率＝（審件總數 − 審件錯誤數）÷ 審件總數；清冊良率＝（清冊總數 − 清冊錯誤數）÷ 清冊總數

create table if not exists public.admin_points_guild_monthly (
  guild_period text not null check (guild_period ~ '^\d{3}/\d{2}$'),
  region text not null default '全區',
  audit_total integer check (audit_total is null or audit_total >= 0),
  audit_err integer check (audit_err is null or audit_err >= 0),
  roster_total integer check (roster_total is null or roster_total >= 0),
  roster_err integer check (roster_err is null or roster_err >= 0),
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (guild_period, region)
);
alter table public.admin_points_guild_monthly enable row level security;
revoke all on public.admin_points_guild_monthly from public, anon, authenticated;

create or replace function public.admin_points_guild_monthly_json(p_from text, p_to text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
    'period', m.guild_period, 'region', m.region,
    'auditTotal', m.audit_total, 'auditErr', m.audit_err, 'rosterTotal', m.roster_total, 'rosterErr', m.roster_err,
    'updatedBy', m.updated_by, 'updatedAt', m.updated_at
  ) order by m.guild_period desc, m.region), '[]'::json)
  from public.admin_points_guild_monthly m
  where m.guild_period between coalesce(nullif(p_from, ''), '000/00') and coalesce(nullif(p_to, ''), '999/99');
$$;
revoke all on function public.admin_points_guild_monthly_json(text, text) from public, anon, authenticated;

-- 前台：登入工具箱即可讀
create or replace function public.admin_points_guild_monthly_view(p_token text, p_from text, p_to text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  return json_build_object('ok', true, 'rows', public.admin_points_guild_monthly_json(p_from, p_to));
end;
$$;
revoke all on function public.admin_points_guild_monthly_view(text, text, text) from public;
grant execute on function public.admin_points_guild_monthly_view(text, text, text) to anon, authenticated;

-- 後台：全部月份
create or replace function public.admin_points_guild_monthly_list(p_secret text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true, 'rows', public.admin_points_guild_monthly_json('', ''));
end;
$$;
revoke all on function public.admin_points_guild_monthly_list(text) from public;
grant execute on function public.admin_points_guild_monthly_list(text) to anon, authenticated;

-- 後台：p_rows＝[{period, region, auditTotal, auditErr, rosterTotal, rosterErr}]，同期數＋地區覆蓋
create or replace function public.admin_points_guild_monthly_save(p_secret text, p_rows jsonb, p_by text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_period text;
  v_region text;
  n integer := 0;
begin
  if not public.toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return json_build_object('ok', false, 'error', '沒有要儲存的月份');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_period := trim(coalesce(r->>'period', ''));
    v_region := coalesce(nullif(trim(coalesce(r->>'region', '')), ''), '全區');
    if v_period !~ '^\d{3}/\d{2}$' or substr(v_period, 5, 2)::int not between 1 and 12 then
      return json_build_object('ok', false, 'error', '公會期數格式不正確：' || v_period);
    end if;
    if v_region not in ('全區', '台北', '新北', '基隆', '宜蘭', '桃園', '新竹', '台中', '彰化', '南投', '嘉義', '台南', '高雄') then
      return json_build_object('ok', false, 'error', '地區不正確：' || v_region);
    end if;
    begin
      insert into public.admin_points_guild_monthly as m (guild_period, region, audit_total, audit_err, roster_total, roster_err, updated_by, updated_at)
      values (v_period, v_region, (r->>'auditTotal')::int, (r->>'auditErr')::int, (r->>'rosterTotal')::int, (r->>'rosterErr')::int,
        left(trim(coalesce(p_by, '')), 40), now())
      on conflict (guild_period, region) do update set
        audit_total = excluded.audit_total, audit_err = excluded.audit_err,
        roster_total = excluded.roster_total, roster_err = excluded.roster_err,
        updated_by = excluded.updated_by, updated_at = now();
    exception when others then
      return json_build_object('ok', false, 'error', v_period || ' 的數字不正確');
    end;
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'saved', n);
end;
$$;
revoke all on function public.admin_points_guild_monthly_save(text, jsonb, text) from public;
grant execute on function public.admin_points_guild_monthly_save(text, jsonb, text) to anon, authenticated;

create or replace function public.admin_points_guild_monthly_delete(p_secret text, p_period text, p_region text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  delete from public.admin_points_guild_monthly where guild_period = p_period and region = p_region;
  if not found then return json_build_object('ok', false, 'error', '找不到這個月份'); end if;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.admin_points_guild_monthly_delete(text, text, text) from public;
grant execute on function public.admin_points_guild_monthly_delete(text, text, text) to anon, authenticated;
