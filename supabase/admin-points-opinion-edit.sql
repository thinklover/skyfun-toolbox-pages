-- 公會意見：後台／督導可改缺失類別、意見內容、行政檢討對策、公會期數、意見時間
-- 督導名單：簡為倢、邱奕棋、黃怡婷（同 VIEW_ALL）

drop function if exists public.admin_points_opinion_admin_update(text, bigint, text, text, text);
drop function if exists public.admin_points_opinion_admin_update(text, bigint, text, text, text, text, text);
drop function if exists public.admin_points_opinion_update(text, bigint, text, text, text);
drop function if exists public.admin_points_opinion_update(text, bigint, text, text, text, text, text);

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
    if v_kind = 'roster' and v_measure = '' then
      return json_build_object('ok', false, 'error', '清冊意見請填行政檢討對策');
    end if;
    if v_kind = 'case' then v_measure := ''; end if;
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
        measure = case when v_kind = 'roster' then v_measure else '' end,
        guild_period = v_period,
        opinion_date = v_odate
  where id = p_id;

  return json_build_object(
    'ok', true,
    'opinion', json_build_object(
      'id', p_id,
      'category', v_cat,
      'content', v_content,
      'measure', case when v_kind = 'roster' then v_measure else '' end,
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
    if v_kind = 'roster' and v_measure = '' then
      return json_build_object('ok', false, 'error', '清冊意見請填行政檢討對策');
    end if;
    if v_kind = 'case' then v_measure := ''; end if;
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
        measure = case when v_kind = 'roster' then v_measure else '' end,
        guild_period = v_period,
        opinion_date = v_odate
  where id = p_id;

  return json_build_object(
    'ok', true,
    'opinion', json_build_object(
      'id', p_id,
      'category', v_cat,
      'content', v_content,
      'measure', case when v_kind = 'roster' then v_measure else '' end,
      'guildPeriod', v_period,
      'opinionDate', v_odate
    )
  );
end;
$$;
revoke all on function public.admin_points_opinion_update(text, bigint, text, text, text, text, text) from public;
grant execute on function public.admin_points_opinion_update(text, bigint, text, text, text, text, text) to anon, authenticated;
