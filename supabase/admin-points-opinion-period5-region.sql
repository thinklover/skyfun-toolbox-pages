-- 五期媒合編號（期別碼 05）填公會意見時一定要選縣市

create or replace function public.admin_points_opinion_is_period5(p_no text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    (regexp_match(public.admin_points_opinion_code(p_no), '^[A-Z][0-9][A-Z][0-9]([0-9]{2})'))[1] = '05',
    false
  );
$$;

revoke all on function public.admin_points_opinion_is_period5(text) from public;
grant execute on function public.admin_points_opinion_is_period5(text) to anon, authenticated;

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
