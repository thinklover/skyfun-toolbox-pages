-- 後台公會意見可改縣市（五期防呆／對區用）

drop function if exists public.admin_points_opinion_admin_update(text, bigint, text, text, text, text, text, text, text);
drop function if exists public.admin_points_opinion_admin_update(text, bigint, text, text, text, text, text, text, text, text);

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
