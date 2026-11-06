-- 五期媒合編號一定帶縣市：星鴻台北A2M10500206。四期維持不帶縣市。
-- 送出時若五期沒寫縣市，依區碼或 region 補上；補不出來就擋下。既有五期一併補上。

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
  if public.admin_points_opinion_is_period5(v_code) then
    return v_company || v_region || v_code;
  end if;
  return v_company || v_code;
end;
$$;

create or replace function public.admin_points_opinion_guard_city()
returns trigger
language plpgsql
as $$
declare
  v_next text;
begin
  if not public.admin_points_opinion_is_period5(new.case_no) then
    return new;
  end if;
  v_next := public.admin_points_opinion_canonical(new.case_no, new.region);
  if v_next = '' or v_next !~ '^(星鴻|星華)(臺北|台北|新北|基隆|宜蘭|桃園|新竹|竹市|竹縣|臺中|台中|彰化|南投|嘉義|嘉市|嘉縣|臺南|台南|高雄)' then
    raise exception '五期媒合編號一定要有縣市';
  end if;
  new.case_no := v_next;
  return new;
end;
$$;

drop trigger if exists admin_points_opinion_city on public.admin_points_opinion;
create trigger admin_points_opinion_city
before insert or update of case_no, region
on public.admin_points_opinion
for each row
execute function public.admin_points_opinion_guard_city();

update public.admin_points_opinion
set case_no = public.admin_points_opinion_canonical(case_no, region)
where public.admin_points_opinion_is_period5(case_no)
  and case_no is distinct from public.admin_points_opinion_canonical(case_no, region);
