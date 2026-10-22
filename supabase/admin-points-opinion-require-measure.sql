-- 案件意見也必須填行政檢討對策（與清冊意見相同）
-- 舊的案件意見可以先空白；之後改到這一欄若清空，一樣擋下來

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
  v_region text := left(trim(coalesce(d->>'region', '')), 20);
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
  if v_case = '' then return json_build_object('ok', false, 'error', '請填媒合編號'); end if;
  if p_kind = 'roster' and v_roster = '' then return json_build_object('ok', false, 'error', '請選清冊期數'); end if;
  if v_content = '' then return json_build_object('ok', false, 'error', '請填公會意見內容'); end if;
  if v_measure = '' then return json_build_object('ok', false, 'error', '請填行政檢討對策'); end if;
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
    v_date, v_content, v_measure, v_cat,
    case when p_kind = 'roster' then v_item else '' end)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.admin_points_opinion_save(text, text, jsonb) from public;
grant execute on function public.admin_points_opinion_save(text, text, jsonb) to anon, authenticated;

create or replace function public.admin_points_opinion_admin_update(
  p_secret text,
  p_id bigint,
  p_category text default null,
  p_content text default null,
  p_measure text default null,
  p_guild_period text default null,
  p_opinion_date text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_cat text;
  v_content text;
  v_measure text;
  v_period text;
  v_odate date;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  select kind, category, content, measure, guild_period, opinion_date
    into v_kind, v_cat, v_content, v_measure, v_period, v_odate
  from public.admin_points_opinion
  where id = p_id;
  if v_kind is null then return json_build_object('ok', false, 'error', '找不到這筆意見'); end if;

  if p_category is not null then
    v_cat := trim(coalesce(p_category, ''));
    if v_cat <> '' and not (v_cat = any (public.admin_points_opinion_cats(v_kind))) then
      return json_build_object('ok', false, 'error', '缺失類別不正確');
    end if;
  end if;
  if p_content is not null then
    v_content := left(trim(coalesce(p_content, '')), 2000);
    if v_content = '' then return json_build_object('ok', false, 'error', '公會意見內容不可空白'); end if;
  end if;
  if p_measure is not null then
    v_measure := left(trim(coalesce(p_measure, '')), 2000);
    if v_measure = '' then
      return json_build_object('ok', false, 'error', '請填行政檢討對策');
    end if;
  end if;
  if p_guild_period is not null then
    v_period := left(trim(coalesce(p_guild_period, '')), 20);
    if v_period = '' or v_period !~ '^\d{2,3}/\d{2}$' then
      return json_build_object('ok', false, 'error', '公會期數格式應為民國年/月，例如 115/10');
    end if;
  end if;
  if p_opinion_date is not null then
    begin
      v_odate := nullif(trim(p_opinion_date), '')::date;
    exception when others then
      return json_build_object('ok', false, 'error', '意見時間格式不正確');
    end;
    if v_odate is null then return json_build_object('ok', false, 'error', '意見時間不可空白'); end if;
  end if;

  update public.admin_points_opinion
    set category = v_cat,
        content = v_content,
        measure = v_measure,
        guild_period = v_period,
        opinion_date = v_odate
  where id = p_id;

  return json_build_object(
    'ok', true,
    'opinion', json_build_object(
      'id', p_id,
      'category', v_cat,
      'content', v_content,
      'measure', v_measure,
      'guildPeriod', v_period,
      'opinionDate', v_odate
    )
  );
end;
$$;
revoke all on function public.admin_points_opinion_admin_update(text, bigint, text, text, text, text, text) from public;
grant execute on function public.admin_points_opinion_admin_update(text, bigint, text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_points_opinion_update(
  p_token text,
  p_id bigint,
  p_category text default null,
  p_content text default null,
  p_measure text default null,
  p_guild_period text default null,
  p_opinion_date text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_me text;
  v_owner uuid;
  v_kind text;
  v_cat text;
  v_content text;
  v_measure text;
  v_period text;
  v_odate date;
  v_super boolean;
begin
  v_uid := public.admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_me
  from public.toolbox_accounts a where a.id = v_uid;
  v_me := trim(coalesce(v_me, ''));
  v_super := v_me in ('簡為倢', '邱奕棋', '黃怡婷');

  select user_id, kind, category, content, measure, guild_period, opinion_date
    into v_owner, v_kind, v_cat, v_content, v_measure, v_period, v_odate
  from public.admin_points_opinion
  where id = p_id;
  if v_kind is null then return json_build_object('ok', false, 'error', '找不到這筆意見'); end if;
  if not (v_super or v_owner = v_uid) then
    return json_build_object('ok', false, 'error', '只能修改自己填的意見（督導可改全部）');
  end if;

  if p_category is not null then
    v_cat := trim(coalesce(p_category, ''));
    if v_cat <> '' and not (v_cat = any (public.admin_points_opinion_cats(v_kind))) then
      return json_build_object('ok', false, 'error', '缺失類別不正確');
    end if;
  end if;
  if p_content is not null then
    v_content := left(trim(coalesce(p_content, '')), 2000);
    if v_content = '' then return json_build_object('ok', false, 'error', '公會意見內容不可空白'); end if;
  end if;
  if p_measure is not null then
    v_measure := left(trim(coalesce(p_measure, '')), 2000);
    if v_measure = '' then
      return json_build_object('ok', false, 'error', '請填行政檢討對策');
    end if;
  end if;
  if p_guild_period is not null then
    v_period := left(trim(coalesce(p_guild_period, '')), 20);
    if v_period = '' or v_period !~ '^\d{2,3}/\d{2}$' then
      return json_build_object('ok', false, 'error', '公會期數格式應為民國年/月，例如 115/10');
    end if;
  end if;
  if p_opinion_date is not null then
    begin
      v_odate := nullif(trim(p_opinion_date), '')::date;
    exception when others then
      return json_build_object('ok', false, 'error', '意見時間格式不正確');
    end;
    if v_odate is null then return json_build_object('ok', false, 'error', '意見時間不可空白'); end if;
  end if;

  update public.admin_points_opinion
    set category = v_cat,
        content = v_content,
        measure = v_measure,
        guild_period = v_period,
        opinion_date = v_odate
  where id = p_id;

  return json_build_object(
    'ok', true,
    'opinion', json_build_object(
      'id', p_id,
      'category', v_cat,
      'content', v_content,
      'measure', v_measure,
      'guildPeriod', v_period,
      'opinionDate', v_odate
    )
  );
end;
$$;
revoke all on function public.admin_points_opinion_update(text, bigint, text, text, text, text, text) from public;
grant execute on function public.admin_points_opinion_update(text, bigint, text, text, text, text, text) to anon, authenticated;

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
      'name', o.staff_name, 'date', o.work_date, 'opinionDate', o.opinion_date, 'content', o.content, 'measure', o.measure, 'category', o.category,
      'rosterItem', o.roster_item
    ) order by o.kind, o.region, o.id)
    from public.admin_points_opinion o
    where o.guild_period = trim(coalesce(p_guild_period, ''))
  ), '[]'::json));
end;
$$;
revoke all on function public.admin_points_kpi_opinions(text, text) from public;
grant execute on function public.admin_points_kpi_opinions(text, text) to anon, authenticated;
