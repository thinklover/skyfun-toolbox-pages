-- 會議計分：部門自己的分數。跟個人分數分開，不寫進 msb_entries。

create table if not exists public.msb_dept_entries (
  id bigserial primary key,
  department text not null,
  score_date date not null,
  score numeric(10, 2) not null,
  item text not null default '',
  note text not null default '',
  created_by uuid,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.msb_dept_entries enable row level security;
revoke all on public.msb_dept_entries from public, anon, authenticated;

create index if not exists msb_dept_entries_date_idx
  on public.msb_dept_entries (score_date, department);

create or replace function public.msb_dept_scores(p_token text, p_period text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  v_period text := trim(coalesce(p_period, ''));
  v_rows json;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  if v_period !~ '^\d{4}(-\d{2})?$' then
    return json_build_object('ok', false, 'error', '期間格式錯誤');
  end if;

  select coalesce(json_agg(json_build_object(
    'department', s.department,
    'score', s.score
  ) order by s.department), '[]'::json)
    into v_rows
  from (
    select department, sum(score) as score
    from public.msb_dept_entries
    where case
      when v_period ~ '^\d{4}$' then to_char(score_date, 'YYYY') = v_period
      else to_char(score_date, 'YYYY-MM') = v_period
    end
    group by department
  ) s;

  return json_build_object('ok', true, 'period', v_period, 'rows', v_rows);
end;
$$;

create or replace function public.msb_dept_entry_save(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_dept text := left(trim(coalesce(d->>'department', '')), 40);
  v_date date;
  v_score numeric(10, 2);
  v_item text := left(trim(coalesce(d->>'item', '')), 80);
  v_note text := left(trim(coalesce(d->>'note', '')), 500);
  v_user_name text;
  v_can_edit boolean;
  v_id bigint;
begin
  select o_can_edit, o_name into v_can_edit, v_user_name from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
  if v_dept = '' then
    return json_build_object('ok', false, 'error', '請選部門');
  end if;
  if not exists (
    select 1 from public.msb_people
    where active and trim(coalesce(department, '')) = v_dept
  ) then
    return json_build_object('ok', false, 'error', '找不到這個部門');
  end if;
  begin
    v_date := (nullif(trim(coalesce(d->>'scoreDate', '')), ''))::date;
  exception when others then
    return json_build_object('ok', false, 'error', '計分日期格式錯誤');
  end;
  begin
    v_score := (nullif(trim(coalesce(d->>'score', '')), ''))::numeric;
  exception when others then
    return json_build_object('ok', false, 'error', '分數格式錯誤');
  end;
  if v_date is null then return json_build_object('ok', false, 'error', '請填計分日期'); end if;
  if v_score is null or v_score = 0 then
    return json_build_object('ok', false, 'error', '分數不可為 0，減分請填負數');
  end if;
  if v_item = '' then v_item := '部門加減分'; end if;

  insert into public.msb_dept_entries (
    department, score_date, score, item, note, created_by, created_by_name
  ) values (
    v_dept, v_date, v_score, v_item, v_note, v_uid, coalesce(v_user_name, '')
  ) returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.msb_dept_scores(text, text) from public;
grant execute on function public.msb_dept_scores(text, text) to anon, authenticated;

revoke all on function public.msb_dept_entry_save(text, jsonb) from public;
grant execute on function public.msb_dept_entry_save(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
