-- 行政自己填寫公會「案件意見」「清冊意見」：每筆 1 點，計入填寫日所在業績月
-- 點數表的「案件意見修正」「清冊意見修正」欄 = 這裡的筆數 + 組長在後台補登的同名項目

create table if not exists public.admin_points_opinion (
  id bigserial primary key,
  kind text not null check (kind in ('case', 'roster')),
  work_date date not null,
  staff_name text not null,
  user_id uuid references public.toolbox_accounts(id) on delete set null,
  guild_period text not null check (length(guild_period) between 1 and 20),
  case_no text not null default '',
  roster_period text not null default '',
  opinion_date date,
  content text not null check (length(content) between 1 and 2000),
  measure text not null default '',
  created_at timestamptz not null default now(),
  check (kind <> 'case' or case_no <> ''),
  check (kind <> 'roster' or (roster_period <> '' and measure <> ''))
);
alter table public.admin_points_opinion add column if not exists region text not null default '';
alter table public.admin_points_opinion add column if not exists category text not null default '';
-- 清冊意見選的那一件（表單04／09 的一筆），同一媒合編號有多件時用來分辨
alter table public.admin_points_opinion add column if not exists roster_item text not null default '';

-- 缺失類別（同公會月報的「審件缺失」「清冊缺失」，前端 Core.OPINION_CATEGORIES 要一致）
create or replace function public.admin_points_opinion_cats(p_kind text)
returns text[]
language sql
immutable
as $$
  select case p_kind
    when 'case' then array['資料缺漏、重複(未檢附)', '未附原租約、不完整', '房東/客資料誤繕、過期、缺漏', '編號誤繕、未填(物編客編媒編)',
      '金額/費用誤繕', '日期未填、誤繕', '未蓋章/未簽章(含章糊)', '表單勾選有誤(未勾、勾錯)', '擺放順序有誤',
      '消防三寶(熱水器滅火器偵煙器)', '其他']
    when 'roster' then array['資料缺漏、重複(未檢附)', '有檢附資料未KEY經控表', '房東/客資料誤繕', '編號誤繕、未填(物編客編媒編)',
      '金額/費用誤繕', '日期未填、誤繕', '未蓋章/未簽章(含章糊)', '表單勾選有誤(未勾、勾錯)', '擺放順序有誤', '其他']
    else array[]::text[]
  end;
$$;
create index if not exists admin_points_opinion_date_idx on public.admin_points_opinion (work_date);
create index if not exists admin_points_opinion_guild_idx on public.admin_points_opinion (guild_period);
alter table public.admin_points_opinion enable row level security;
revoke all on public.admin_points_opinion from public, anon, authenticated;

create or replace function public.admin_points_payload(p_start date, p_end date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'ok', true,
    'staff', coalesce((
      select json_agg(json_build_object(
        'id', s.id, 'name', s.name, 'status', s.status, 'kind', s.kind, 'note', s.note,
        'region', s.region, 'office', s.office, 'hireDate', s.hire_date, 'project', s.project,
        'leader', s.leader
      ) order by s.status, s.kind, s.name)
      from public.admin_points_staff s
    ), '[]'::json),
    'incidents', coalesce((
      select json_agg(json_build_object(
        'id', i.id, 'date', i.work_date, 'name', i.staff_name, 'complaints', i.complaints,
        'penalty', i.penalty, 'compensation', i.compensation, 'note', i.note, 'createdBy', i.created_by
      ) order by i.work_date, i.id)
      from public.admin_points_incident i
      where i.work_date between p_start and p_end
    ), '[]'::json),
    'checks', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'date', c.work_date, 'name', c.staff_name, 'checked', c.checked,
        'correct', c.correct, 'note', c.note, 'createdBy', c.created_by,
        'spotKey', c.spot_key, 'spotNode', c.spot_node, 'checkedAt', c.created_at,
        'auditTime', (
          select it->>'time'
          from public.admin_points_spot_draw d, jsonb_array_elements(d.items) it
          where c.spot_key <> '' and it->>'key' = c.spot_key and coalesce(it->>'node', '') = coalesce(c.spot_node, '')
          order by d.created_at desc
          limit 1
        )
      ) order by c.work_date, c.id)
      from public.admin_points_check c
      where c.work_date between p_start and p_end
    ), '[]'::json),
    'manual', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'date', m.work_date, 'name', m.staff_name, 'item', m.item,
        'qty', m.qty, 'points', m.points, 'note', m.note, 'leader', m.leader, 'createdBy', m.created_by
      ) order by m.work_date, m.id)
      from public.admin_points_manual m
      where m.work_date between p_start and p_end
    ), '[]'::json),
    'opinions', coalesce((
      select json_agg(json_build_object(
        'id', o.id, 'kind', o.kind, 'date', o.work_date, 'name', o.staff_name,
        'guildPeriod', o.guild_period, 'caseNo', o.case_no, 'rosterPeriod', o.roster_period, 'region', o.region,
        'opinionDate', o.opinion_date, 'content', o.content, 'measure', o.measure, 'createdAt', o.created_at,
        'category', o.category, 'rosterItem', o.roster_item
      ) order by o.work_date, o.id)
      from public.admin_points_opinion o
      where o.work_date between p_start and p_end
    ), '[]'::json),
    'training', coalesce((
      select json_agg(json_build_object(
        'id', t.id, 'name', t.staff_name, 'skill', t.skill, 'date', t.trained_date,
        'note', t.note, 'createdBy', t.created_by
      ) order by t.staff_name, t.skill)
      from public.admin_points_training t
    ), '[]'::json)
  );
$$;
revoke all on function public.admin_points_payload(date, date) from public, anon, authenticated;

-- p_data：{guildPeriod, region, caseNo, rosterPeriod, rosterItem, opinionDate, category, content, measure}
create or replace function public.admin_points_opinion_save(p_token text, p_kind text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_name text;
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_period text := left(trim(coalesce(d->>'guildPeriod', '')), 20);
  v_case text := left(trim(coalesce(d->>'caseNo', '')), 60);
  v_roster text := left(trim(coalesce(d->>'rosterPeriod', '')), 20);
  v_item text := left(trim(coalesce(d->>'rosterItem', '')), 300);
  v_region text := trim(coalesce(d->>'region', ''));
  v_content text := left(trim(coalesce(d->>'content', '')), 2000);
  v_measure text := left(trim(coalesce(d->>'measure', '')), 2000);
  v_cat text := trim(coalesce(d->>'category', ''));
  v_date date;
  v_id bigint;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_name from public.toolbox_accounts a where a.id = v_uid;
  if coalesce(v_name, '') = '' then return json_build_object('ok', false, 'error', '帳號沒有姓名，請聯絡管理員'); end if;
  if p_kind not in ('case', 'roster') then return json_build_object('ok', false, 'error', '資料錯誤'); end if;
  if v_period = '' then return json_build_object('ok', false, 'error', '請填公會期數'); end if;
  if v_region not in ('台北', '新北', '基隆', '宜蘭', '桃園', '新竹', '台中', '彰化', '南投', '嘉義', '台南', '高雄') then
    return json_build_object('ok', false, 'error', '請選縣市');
  end if;
  if v_case = '' then return json_build_object('ok', false, 'error', '請填媒合編號'); end if;
  if p_kind = 'roster' and v_roster = '' then return json_build_object('ok', false, 'error', '請選清冊期數'); end if;
  if v_content = '' then return json_build_object('ok', false, 'error', '請填公會意見內容'); end if;
  if p_kind = 'roster' and v_measure = '' then return json_build_object('ok', false, 'error', '請填行政檢討對策'); end if;
  begin
    v_date := nullif(d->>'opinionDate', '')::date;
  exception when others then
    return json_build_object('ok', false, 'error', '意見時間格式不正確');
  end;
  if v_date is null then return json_build_object('ok', false, 'error', '請填意見時間'); end if;
  if v_cat = '' then return json_build_object('ok', false, 'error', '請選缺失類別'); end if;
  if not (v_cat = any (public.admin_points_opinion_cats(p_kind))) then
    return json_build_object('ok', false, 'error', '缺失類別不正確');
  end if;
  insert into public.admin_points_opinion (kind, work_date, staff_name, user_id, guild_period, region, case_no, roster_period,
    opinion_date, content, measure, category, roster_item)
  values (p_kind, (now() at time zone 'Asia/Taipei')::date, v_name, v_uid, v_period, v_region,
    v_case,
    case when p_kind = 'roster' then v_roster else '' end,
    v_date, v_content, case when p_kind = 'roster' then v_measure else '' end, v_cat,
    case when p_kind = 'roster' then v_item else '' end)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.admin_points_opinion_delete(p_token text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := public.admin_qa_user_id(p_token);
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  delete from public.admin_points_opinion where id = p_id and user_id = v_uid;
  if not found then return json_build_object('ok', false, 'error', '只能刪除自己填的意見'); end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_points_opinion_admin_delete(p_secret text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  delete from public.admin_points_opinion where id = p_id;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆意見'); end if;
  return json_build_object('ok', true);
end;
$$;

-- KPI 報表：某公會期數（如 '115/09'）的全部意見，錯誤件數用
create or replace function public.admin_points_kpi_opinions(p_secret text, p_guild_period text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true, 'opinions', coalesce((
    select json_agg(json_build_object(
      'id', o.id, 'kind', o.kind, 'region', o.region, 'caseNo', o.case_no, 'rosterPeriod', o.roster_period,
      'name', o.staff_name, 'date', o.work_date, 'opinionDate', o.opinion_date, 'content', o.content, 'category', o.category,
      'rosterItem', o.roster_item
    ) order by o.kind, o.region, o.id)
    from public.admin_points_opinion o
    where o.guild_period = trim(coalesce(p_guild_period, ''))
  ), '[]'::json));
end;
$$;

-- 組長週報的清冊／審件作業良率：登入工具箱即可讀（同 admin_points_view 已能看到的意見）
create or replace function public.admin_points_kpi_opinions_view(p_token text, p_guild_period text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  return json_build_object('ok', true, 'opinions', coalesce((
    select json_agg(json_build_object('kind', o.kind, 'region', o.region, 'caseNo', o.case_no, 'category', o.category) order by o.id)
    from public.admin_points_opinion o
    where o.guild_period = trim(coalesce(p_guild_period, ''))
  ), '[]'::json));
end;
$$;
revoke all on function public.admin_points_kpi_opinions_view(text, text) from public;
grant execute on function public.admin_points_kpi_opinions_view(text, text) to anon, authenticated;

-- 後台「公會意見」：全部期間的案件／清冊意見（分類、篩選在前端做）
create or replace function public.admin_points_opinion_all(p_secret text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true, 'opinions', coalesce((
    select json_agg(json_build_object(
      'id', o.id, 'kind', o.kind, 'date', o.work_date, 'name', o.staff_name,
      'guildPeriod', o.guild_period, 'caseNo', o.case_no, 'rosterPeriod', o.roster_period, 'region', o.region,
      'opinionDate', o.opinion_date, 'content', o.content, 'measure', o.measure, 'createdAt', o.created_at,
      'category', o.category, 'rosterItem', o.roster_item
    ) order by o.work_date desc, o.id desc)
    from (select * from public.admin_points_opinion order by work_date desc, id desc limit 5000) o
  ), '[]'::json));
end;
$$;
revoke all on function public.admin_points_opinion_all(text) from public;
grant execute on function public.admin_points_opinion_all(text) to anon, authenticated;

-- 後台「公會意見」：改缺失類別（空字串＝未分類）
create or replace function public.admin_points_opinion_set_category(p_secret text, p_id bigint, p_category text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_cat text := trim(coalesce(p_category, ''));
begin
  if not public.toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  select kind into v_kind from public.admin_points_opinion where id = p_id;
  if v_kind is null then return json_build_object('ok', false, 'error', '找不到這筆意見'); end if;
  if v_cat <> '' and not (v_cat = any (public.admin_points_opinion_cats(v_kind))) then
    return json_build_object('ok', false, 'error', '缺失類別不正確');
  end if;
  update public.admin_points_opinion set category = v_cat where id = p_id;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.admin_points_opinion_set_category(text, bigint, text) from public;
grant execute on function public.admin_points_opinion_set_category(text, bigint, text) to anon, authenticated;

revoke all on function public.admin_points_kpi_opinions(text, text) from public;
grant execute on function public.admin_points_kpi_opinions(text, text) to anon, authenticated;
revoke all on function public.admin_points_opinion_save(text, text, jsonb) from public;
revoke all on function public.admin_points_opinion_delete(text, bigint) from public;
revoke all on function public.admin_points_opinion_admin_delete(text, bigint) from public;
grant execute on function public.admin_points_opinion_save(text, text, jsonb) to anon, authenticated;
grant execute on function public.admin_points_opinion_delete(text, bigint) to anon, authenticated;
grant execute on function public.admin_points_opinion_admin_delete(text, bigint) to anon, authenticated;
