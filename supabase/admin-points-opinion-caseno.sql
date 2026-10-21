-- 公會意見媒合編號：固定格式「星鴻／星華＋後段代碼」（例：星鴻F2M10500502），不帶縣市；縣市另外看 region 欄
-- 同一媒合編號（同 kind、同後段代碼）有多筆意見時，只認列第一筆 1 點，其餘 no_points。

-- 後段代碼（A2M10400196-2 / F2M10500502…）；取不到回傳空字串
create or replace function public.admin_points_opinion_code(p_no text)
returns text
language sql
immutable
as $$
  select coalesce(
    (regexp_match(
      upper(regexp_replace(replace(replace(replace(coalesce(p_no, ''), '臺', '台'), '鸿', '鴻'), '华', '華'), '\s', '', 'g')),
      '([A-Z][0-9][A-Z][0-9]+(-[0-9]+)?)$'
    ))[1], '');
$$;

-- 代碼首字母 → KPI 地區（同前端 KPI_CASE_LETTER）
create or replace function public.admin_points_opinion_letter_region(p_code text)
returns text
language sql
immutable
as $$
  select case substr(coalesce(p_code, ''), 1, 1)
    when 'A' then '台北' when 'B' then '新北' when 'C' then '桃園' when 'D' then '台中'
    when 'E' then '台南' when 'F' then '高雄' when 'G' then '基隆' when 'H' then '新竹'
    when 'I' then '嘉義' when 'J' then '新竹' when 'L' then '彰化' when 'N' then '嘉義'
    when 'P' then '南投' when 'Q' then '宜蘭' else '' end;
$$;

-- 組成固定格式（不帶縣市）；代碼取不到回傳空字串。p_region 只用來確認有地區，編號本身不組縣市
create or replace function public.admin_points_opinion_canonical(p_no text, p_region text)
returns text
language plpgsql
immutable
as $$
declare
  v_raw text := regexp_replace(replace(replace(replace(coalesce(p_no, ''), '臺', '台'), '鸿', '鴻'), '华', '華'), '\s', '', 'g');
  v_code text := public.admin_points_opinion_code(p_no);
  v_region text := public.admin_points_opinion_letter_region(v_code);
  v_company text;
begin
  if v_code = '' then return ''; end if;
  if v_region = '' then v_region := trim(coalesce(p_region, '')); end if;
  if v_region = '' then return ''; end if;
  v_company := case when position('星華' in v_raw) > 0 then '星華' else '星鴻' end;
  return v_company || v_code;
end;
$$;
revoke all on function public.admin_points_opinion_code(text) from public;
revoke all on function public.admin_points_opinion_letter_region(text) from public;
revoke all on function public.admin_points_opinion_canonical(text, text) from public;

-- 既有資料：編號正規化成固定格式（取不到後段代碼的如「一覽表」「表8」或空白不動）
update public.admin_points_opinion o
set case_no = public.admin_points_opinion_canonical(o.case_no, o.region)
where public.admin_points_opinion_code(o.case_no) <> ''
  and public.admin_points_opinion_canonical(o.case_no, o.region) <> ''
  and o.case_no <> public.admin_points_opinion_canonical(o.case_no, o.region);

-- 既有重複：同 kind、同後段代碼只給第一筆（created_at, id 最早）點數
with ranked as (
  select id,
         row_number() over (
           partition by kind, public.admin_points_opinion_code(case_no)
           order by created_at, id
         ) as rn
  from public.admin_points_opinion
  where public.admin_points_opinion_code(case_no) <> ''
)
update public.admin_points_opinion o
set no_points = true,
    no_points_reason = case when trim(coalesce(o.no_points_reason, '')) = ''
      then '同一媒合編號只認列第一筆，本筆不給點' else o.no_points_reason end
from ranked r
where r.id = o.id and r.rn > 1;

-- 送出：格式驗證＋正規化＋同編號防呆（已有同編號意見 → 本筆 0 點，仍保留意見內容）
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
  v_code text;
  v_letter_region text;
  v_dup boolean;
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

  v_code := public.admin_points_opinion_code(v_case);
  if v_code = '' then
    return json_build_object('ok', false, 'error', '媒合編號格式不正確：請填後段編號（例如 F2M10500502），系統會組成「星鴻F2M10500502」（不帶縣市）');
  end if;
  v_letter_region := public.admin_points_opinion_letter_region(v_code);
  if v_letter_region <> '' and v_letter_region <> v_region then
    return json_build_object('ok', false, 'error', '這個編號是' || v_letter_region || '的案件，與所選縣市「' || v_region || '」不符，請確認縣市或編號');
  end if;
  v_case := public.admin_points_opinion_canonical(v_case, v_region);
  if v_case = '' then return json_build_object('ok', false, 'error', '媒合編號格式不正確'); end if;

  select exists (
    select 1 from public.admin_points_opinion o
    where o.kind = p_kind and public.admin_points_opinion_code(o.case_no) = v_code
  ) into v_dup;

  insert into public.admin_points_opinion (kind, work_date, staff_name, user_id, guild_period, region, case_no, roster_period,
    opinion_date, content, measure, category, roster_item, no_points, no_points_reason)
  values (p_kind, (now() at time zone 'Asia/Taipei')::date, v_name, v_uid, v_period, v_region,
    v_case,
    case when p_kind = 'roster' then v_roster else '' end,
    v_date, v_content, case when p_kind = 'roster' then v_measure else '' end, v_cat,
    case when p_kind = 'roster' then v_item else '' end,
    v_dup,
    case when v_dup then '同一媒合編號只認列第一筆，本筆不給點' else '' end)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'duplicate', v_dup, 'caseNo', v_case, 'points', case when v_dup then 0 else 1 end);
end;
$$;
revoke all on function public.admin_points_opinion_save(text, text, jsonb) from public;
grant execute on function public.admin_points_opinion_save(text, text, jsonb) to anon, authenticated;
