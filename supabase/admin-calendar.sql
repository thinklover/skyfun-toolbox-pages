-- 行政專區行事曆：使用者自行新增的共用事項（登入者皆可看、可新增；只有建立者可修改／刪除）

create table if not exists public.admin_calendar_events (
  id bigint generated always as identity primary key,
  start_date date not null,
  end_date date not null,
  title text not null,
  note text not null default '',
  repeat text not null default 'none' check (repeat in ('none', 'monthly', 'yearly')),
  created_by uuid references public.toolbox_accounts(id) on delete set null,
  created_by_name text not null default '',
  team text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 31)
);
create index if not exists admin_calendar_events_range_idx on public.admin_calendar_events (start_date, end_date);
alter table public.admin_calendar_events enable row level security;
revoke all on public.admin_calendar_events from anon, authenticated;

create or replace function public.admin_calendar_list(p_token text, p_from date, p_to date)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  return json_build_object('ok', true, 'items', coalesce((
    select json_agg(row_to_json(x) order by x."startDate", x.id) from (
      select e.id, e.start_date as "startDate", e.end_date as "endDate", e.title, e.note, e.repeat,
        e.created_by_name as "createdByName", e.team, e.created_at as "createdAt", e.updated_at as "updatedAt",
        (e.created_by = v_uid) as mine
      from public.admin_calendar_events e
      where (e.repeat <> 'none' and e.start_date <= p_to)
         or (e.repeat = 'none' and e.end_date >= p_from and e.start_date <= p_to)
      limit 1000
    ) x), '[]'::json));
end; $$;

create or replace function public.admin_calendar_save(p_token text, p_id bigint, p_data jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid;
  v_acc public.toolbox_accounts%rowtype;
  v_title text := left(trim(coalesce(p_data->>'title', '')), 60);
  v_note text := left(trim(coalesce(p_data->>'note', '')), 1000);
  v_repeat text := coalesce(nullif(p_data->>'repeat', ''), 'none');
  v_start date;
  v_end date;
  v_row public.admin_calendar_events%rowtype;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  begin
    v_start := (p_data->>'startDate')::date;
    v_end := coalesce(nullif(p_data->>'endDate', '')::date, v_start);
  exception when others then
    return json_build_object('ok', false, 'error', '日期格式不正確');
  end;
  if v_start is null then return json_build_object('ok', false, 'error', '請選擇日期'); end if;
  if v_title = '' then return json_build_object('ok', false, 'error', '請填寫標題'); end if;
  if v_repeat not in ('none', 'monthly', 'yearly') then return json_build_object('ok', false, 'error', '重複設定不正確'); end if;
  if v_end < v_start then return json_build_object('ok', false, 'error', '結束日不能早於開始日'); end if;
  if v_end - v_start > 31 then return json_build_object('ok', false, 'error', '一次最多 32 天'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;

  if p_id is null then
    insert into public.admin_calendar_events (start_date, end_date, title, note, repeat, created_by, created_by_name, team)
    values (v_start, v_end, v_title, v_note, v_repeat, v_uid, coalesce(nullif(v_acc.name, ''), ''), coalesce(v_acc.team, ''))
    returning * into v_row;
  else
    update public.admin_calendar_events set
      start_date = v_start, end_date = v_end, title = v_title, note = v_note, repeat = v_repeat, updated_at = now()
    where id = p_id and created_by = v_uid
    returning * into v_row;
    if not found then return json_build_object('ok', false, 'error', '只能修改自己新增的事項'); end if;
  end if;
  return json_build_object('ok', true, 'id', v_row.id);
end; $$;

create or replace function public.admin_calendar_delete(p_token text, p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  delete from public.admin_calendar_events where id = p_id and created_by = v_uid;
  if not found then return json_build_object('ok', false, 'error', '只能刪除自己新增的事項'); end if;
  return json_build_object('ok', true);
end; $$;

create or replace function public.admin_calendar_admin_delete(p_secret text, p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  delete from public.admin_calendar_events where id = p_id;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆事項'); end if;
  return json_build_object('ok', true);
end; $$;

revoke all on function public.admin_calendar_list(text, date, date) from public;
revoke all on function public.admin_calendar_save(text, bigint, jsonb) from public;
revoke all on function public.admin_calendar_delete(text, bigint) from public;
revoke all on function public.admin_calendar_admin_delete(text, bigint) from public;
grant execute on function public.admin_calendar_list(text, date, date) to anon, authenticated;
grant execute on function public.admin_calendar_save(text, bigint, jsonb) to anon, authenticated;
grant execute on function public.admin_calendar_delete(text, bigint) to anon, authenticated;
grant execute on function public.admin_calendar_admin_delete(text, bigint) to anon, authenticated;
