-- 案件繳交稽核：各地區每月的清冊繳交日、案件繳交日（行政手填，一個地區一個月各一個日期）

create table if not exists public.admin_points_lease_due (
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  region text not null,
  due_date date,
  case_due_date date,
  set_by text not null default '',
  user_id uuid references public.toolbox_accounts(id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (month, region)
);
-- due_date＝清冊繳交日；case_due_date＝案件繳交日（後加）
alter table public.admin_points_lease_due add column if not exists case_due_date date;
alter table public.admin_points_lease_due alter column due_date drop not null;
alter table public.admin_points_lease_due enable row level security;
revoke all on public.admin_points_lease_due from public, anon, authenticated;

create or replace function public.admin_points_lease_dues(p_token text, p_month text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  return json_build_object('ok', true, 'dues', coalesce((
    select json_agg(json_build_object('region', d.region, 'due', d.due_date, 'caseDue', d.case_due_date, 'by', d.set_by, 'at', d.set_at) order by d.region)
    from public.admin_points_lease_due d
    where d.month = p_month
  ), '[]'::json));
end;
$$;

-- p_dues：[{ "region": "台北", "due": "2026-10-20", "caseDue": "2026-10-25" }]；due＝清冊、caseDue＝案件，空白＝清除；兩個都空就刪掉該地區
create or replace function public.admin_points_lease_due_set(p_token text, p_month text, p_dues json)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_name text;
  v_item json;
  v_region text;
  v_first date;
  v_dates date[];
  v_raw text;
  v_label text;
  i int;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  if coalesce(p_month, '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then return json_build_object('ok', false, 'error', '月份格式錯誤'); end if;
  if p_dues is null or json_typeof(p_dues) <> 'array' or json_array_length(p_dues) > 30 then
    return json_build_object('ok', false, 'error', '資料錯誤');
  end if;
  v_first := (p_month || '-01')::date;
  select trim(coalesce(a.name, '')) into v_name from public.toolbox_accounts a where a.id = v_uid;
  for v_item in select * from json_array_elements(p_dues) loop
    v_region := left(trim(coalesce(v_item->>'region', '')), 10);
    continue when v_region = '';
    v_dates := array[null::date, null::date];
    for i in 1..2 loop
      v_raw := trim(coalesce(v_item->>(case i when 1 then 'due' else 'caseDue' end), ''));
      v_label := v_region || (case i when 1 then '的清冊繳交日' else '的案件繳交日' end);
      continue when v_raw = '';
      begin
        v_dates[i] := v_raw::date;
      exception when others then
        return json_build_object('ok', false, 'error', v_label || '格式錯誤');
      end;
      if v_dates[i] < v_first - interval '1 month' or v_dates[i] > v_first + interval '3 months' then
        return json_build_object('ok', false, 'error', v_label || '離 ' || p_month || ' 太遠，請確認');
      end if;
    end loop;
    if v_dates[1] is null and v_dates[2] is null then
      delete from public.admin_points_lease_due where month = p_month and region = v_region;
      continue;
    end if;
    insert into public.admin_points_lease_due (month, region, due_date, case_due_date, set_by, user_id)
    values (p_month, v_region, v_dates[1], v_dates[2], coalesce(v_name, ''), v_uid)
    on conflict (month, region) do update set
      due_date = excluded.due_date, case_due_date = excluded.case_due_date,
      set_by = excluded.set_by, user_id = excluded.user_id, set_at = now()
    where (public.admin_points_lease_due.due_date, public.admin_points_lease_due.case_due_date)
      is distinct from (excluded.due_date, excluded.case_due_date);
  end loop;
  return public.admin_points_lease_dues(p_token, p_month);
end;
$$;

revoke all on function public.admin_points_lease_dues(text, text) from public;
revoke all on function public.admin_points_lease_due_set(text, text, json) from public;
grant execute on function public.admin_points_lease_dues(text, text) to anon, authenticated;
grant execute on function public.admin_points_lease_due_set(text, text, json) to anon, authenticated;
