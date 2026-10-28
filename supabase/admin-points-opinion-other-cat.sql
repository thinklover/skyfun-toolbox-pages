-- 缺失類別選「其他」時可填說明，存成「其他：說明」（圖表仍歸「其他」）

create or replace function public.admin_points_opinion_cat_ok(p_kind text, p_cat text)
returns boolean
language sql
immutable
as $$
  select
    coalesce(p_cat, '') = any (public.admin_points_opinion_cats(p_kind))
    or (
      coalesce(p_cat, '') ~ '^其他：.+'
      and char_length(p_cat) <= 80
    );
$$;

revoke all on function public.admin_points_opinion_cat_ok(text, text) from public;
grant execute on function public.admin_points_opinion_cat_ok(text, text) to anon, authenticated;

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
  v_cat text := left(trim(coalesce(d->>'category', '')), 80);
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
  if public.admin_points_opinion_is_period5(v_case) and v_region = '' then
    return json_build_object('ok', false, 'error', '五期媒合編號請選縣市');
  end if;
  if v_content = '' then return json_build_object('ok', false, 'error', '請填公會意見內容'); end if;
  if v_measure = '' then return json_build_object('ok', false, 'error', '請填行政檢討對策'); end if;
  begin
    v_date := nullif(d->>'opinionDate', '')::date;
  exception when others then
    return json_build_object('ok', false, 'error', '意見時間格式不正確');
  end;
  if v_date is null then return json_build_object('ok', false, 'error', '請填意見時間'); end if;
  if v_cat = '' then return json_build_object('ok', false, 'error', '請選缺失類別'); end if;
  if v_cat = '其他' then
    return json_build_object('ok', false, 'error', '選「其他」時請填寫實際類別說明');
  end if;
  if not public.admin_points_opinion_cat_ok(p_kind, v_cat) then
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

create or replace function public.admin_points_opinion_update(
  p_token text,
  p_id bigint,
  p_category text default null,
  p_content text default null,
  p_measure text default null,
  p_guild_period text default null,
  p_opinion_date text default null,
  p_case_no text default null,
  p_roster_period text default null
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
  v_case text;
  v_roster text;
  v_region text;
  v_old_code text;
  v_new_code text;
  v_canon text;
  v_super boolean;
  v_rosters text[] := array['三期', '3-1期', '四期', '增辦四期', '五期'];
begin
  v_uid := public.admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_me
  from public.toolbox_accounts a where a.id = v_uid;
  v_me := trim(coalesce(v_me, ''));
  v_super := v_me in ('簡為倢', '邱奕棋', '黃怡婷');

  select user_id, kind, category, content, measure, guild_period, opinion_date, case_no, roster_period, region
    into v_owner, v_kind, v_cat, v_content, v_measure, v_period, v_odate, v_case, v_roster, v_region
  from public.admin_points_opinion
  where id = p_id;
  if v_kind is null then return json_build_object('ok', false, 'error', '找不到這筆意見'); end if;
  if not (v_super or v_owner = v_uid) then
    return json_build_object('ok', false, 'error', '只能修改自己填的意見（督導可改全部）');
  end if;

  v_old_code := public.admin_points_opinion_code(v_case);

  if p_category is not null then
    v_cat := left(trim(coalesce(p_category, '')), 80);
    if v_cat = '其他' then
      return json_build_object('ok', false, 'error', '選「其他」時請填寫實際類別說明');
    end if;
    if v_cat <> '' and not public.admin_points_opinion_cat_ok(v_kind, v_cat) then
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
  if p_case_no is not null then
    v_case := left(trim(coalesce(p_case_no, '')), 60);
    if v_case = '' then return json_build_object('ok', false, 'error', '媒合編號不可空白'); end if;
    if public.admin_points_opinion_code(v_case) = '' then
      return json_build_object('ok', false, 'error', '媒合編號格式不正確：請填後段編號（例如 F2M10500502）');
    end if;
    v_canon := public.admin_points_opinion_canonical(v_case, coalesce(v_region, ''));
    if v_canon = '' then
      return json_build_object('ok', false, 'error', '媒合編號格式不正確');
    end if;
    v_case := v_canon;
  end if;
  if p_roster_period is not null then
    if v_kind <> 'roster' then
      return json_build_object('ok', false, 'error', '只有清冊意見才能改清冊期數');
    end if;
    v_roster := left(trim(coalesce(p_roster_period, '')), 20);
    if v_roster = '' or not (v_roster = any (v_rosters)) then
      return json_build_object('ok', false, 'error', '清冊期數不正確');
    end if;
  end if;

  update public.admin_points_opinion
    set category = v_cat,
        content = v_content,
        measure = v_measure,
        guild_period = v_period,
        opinion_date = v_odate,
        case_no = v_case,
        roster_period = case when v_kind = 'roster' then v_roster else '' end
  where id = p_id;

  v_new_code := public.admin_points_opinion_code(v_case);
  if p_case_no is not null then
    perform public.admin_points_opinion_recalc_code(v_kind, v_old_code);
    perform public.admin_points_opinion_recalc_code(v_kind, v_new_code);
  end if;

  return json_build_object(
    'ok', true,
    'opinion', json_build_object(
      'id', p_id,
      'category', v_cat,
      'content', v_content,
      'measure', v_measure,
      'guildPeriod', v_period,
      'opinionDate', v_odate,
      'caseNo', v_case,
      'rosterPeriod', case when v_kind = 'roster' then v_roster else '' end,
      'region', coalesce(v_region, ''),
      'noPoints', (select no_points from public.admin_points_opinion where id = p_id),
      'noPointsReason', (select no_points_reason from public.admin_points_opinion where id = p_id)
    )
  );
end;
$$;

revoke all on function public.admin_points_opinion_update(text, bigint, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_points_opinion_update(text, bigint, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_points_opinion_admin_update(
  p_secret text,
  p_id bigint,
  p_category text default null,
  p_content text default null,
  p_measure text default null,
  p_guild_period text default null,
  p_opinion_date text default null,
  p_case_no text default null,
  p_roster_period text default null,
  p_region text default null
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
  v_case text;
  v_roster text;
  v_region text;
  v_old_code text;
  v_new_code text;
  v_canon text;
  v_rosters text[] := array['三期', '3-1期', '四期', '增辦四期', '五期'];
  v_regions text[] := array['台北', '新北', '基隆', '宜蘭', '桃園', '新竹', '台中', '彰化', '南投', '嘉義', '台南', '高雄'];
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  select kind, category, content, measure, guild_period, opinion_date, case_no, roster_period, region
    into v_kind, v_cat, v_content, v_measure, v_period, v_odate, v_case, v_roster, v_region
  from public.admin_points_opinion
  where id = p_id;
  if v_kind is null then return json_build_object('ok', false, 'error', '找不到這筆意見'); end if;

  v_old_code := public.admin_points_opinion_code(v_case);

  if p_category is not null then
    v_cat := left(trim(coalesce(p_category, '')), 80);
    if v_cat = '其他' then
      return json_build_object('ok', false, 'error', '選「其他」時請填寫實際類別說明');
    end if;
    if v_cat <> '' and not public.admin_points_opinion_cat_ok(v_kind, v_cat) then
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
  if p_region is not null then
    v_region := left(trim(coalesce(p_region, '')), 20);
    if v_region <> '' and not (v_region = any (v_regions)) then
      return json_build_object('ok', false, 'error', '縣市不正確');
    end if;
  end if;
  if p_case_no is not null then
    v_case := left(trim(coalesce(p_case_no, '')), 60);
    if v_case = '' then return json_build_object('ok', false, 'error', '媒合編號不可空白'); end if;
    if public.admin_points_opinion_code(v_case) = '' then
      return json_build_object('ok', false, 'error', '媒合編號格式不正確：請填後段編號（例如 F2M10500502）');
    end if;
    v_canon := public.admin_points_opinion_canonical(v_case, coalesce(v_region, ''));
    if v_canon = '' then
      return json_build_object('ok', false, 'error', '媒合編號格式不正確');
    end if;
    v_case := v_canon;
  end if;
  if p_roster_period is not null then
    if v_kind <> 'roster' then
      return json_build_object('ok', false, 'error', '只有清冊意見才能改清冊期數');
    end if;
    v_roster := left(trim(coalesce(p_roster_period, '')), 20);
    if v_roster = '' or not (v_roster = any (v_rosters)) then
      return json_build_object('ok', false, 'error', '清冊期數不正確');
    end if;
  end if;

  update public.admin_points_opinion
    set category = v_cat,
        content = v_content,
        measure = v_measure,
        guild_period = v_period,
        opinion_date = v_odate,
        case_no = v_case,
        region = coalesce(v_region, ''),
        roster_period = case when v_kind = 'roster' then v_roster else '' end
  where id = p_id;

  v_new_code := public.admin_points_opinion_code(v_case);
  if p_case_no is not null then
    perform public.admin_points_opinion_recalc_code(v_kind, v_old_code);
    perform public.admin_points_opinion_recalc_code(v_kind, v_new_code);
  end if;

  return json_build_object(
    'ok', true,
    'opinion', json_build_object(
      'id', p_id,
      'category', v_cat,
      'content', v_content,
      'measure', v_measure,
      'guildPeriod', v_period,
      'opinionDate', v_odate,
      'caseNo', v_case,
      'rosterPeriod', case when v_kind = 'roster' then v_roster else '' end,
      'region', coalesce(v_region, ''),
      'noPoints', (select no_points from public.admin_points_opinion where id = p_id),
      'noPointsReason', (select no_points_reason from public.admin_points_opinion where id = p_id)
    )
  );
end;
$$;

revoke all on function public.admin_points_opinion_admin_update(text, bigint, text, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_points_opinion_admin_update(text, bigint, text, text, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
