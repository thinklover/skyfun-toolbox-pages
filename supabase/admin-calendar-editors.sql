-- 行政行事曆：簡為倢、邱奕棋、黃怡婷可直接修改行事曆內容
-- 1. 同仁新增的事項：這三位可以修改／刪除任何人的
-- 2. 內建事項（固定任務、公司年度行事曆、三節送禮）：修改內容存在 admin_calendar_overrides，可隱藏、可還原
--    item_key：固定任務為「任務id@YYYY-MM」（單月）或「任務id@*」（之後每個月），其餘為事項 id

create or replace function public.admin_calendar_is_editor(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.toolbox_accounts a
    where a.id = p_uid and trim(coalesce(nullif(a.name, ''), a.username)) in ('簡為倢', '邱奕棋', '黃怡婷')
  );
$$;
revoke all on function public.admin_calendar_is_editor(uuid) from public, anon, authenticated;

create table if not exists public.admin_calendar_overrides (
  item_key text primary key check (length(item_key) between 1 and 80),
  hidden boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  updated_by_name text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.admin_calendar_overrides enable row level security;
revoke all on public.admin_calendar_overrides from anon, authenticated;

create or replace function public.admin_calendar_list(p_token text, p_from date, p_to date)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_editor boolean;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  v_editor := admin_calendar_is_editor(v_uid);
  return json_build_object('ok', true, 'editor', v_editor,
    'items', coalesce((
      select json_agg(row_to_json(x) order by x."startDate", x.id) from (
        select e.id, e.start_date as "startDate", e.end_date as "endDate", e.title, e.note, e.repeat,
          e.created_by_name as "createdByName", e.team, e.created_at as "createdAt", e.updated_at as "updatedAt",
          (e.created_by = v_uid or v_editor) as mine
        from public.admin_calendar_events e
        where (e.repeat <> 'none' and e.start_date <= p_to)
           or (e.repeat = 'none' and e.end_date >= p_from and e.start_date <= p_to)
        limit 1000
      ) x), '[]'::json),
    'overrides', coalesce((
      select json_agg(json_build_object('key', o.item_key, 'hidden', o.hidden, 'data', o.data,
        'by', o.updated_by_name, 'at', o.updated_at))
      from public.admin_calendar_overrides o
    ), '[]'::json));
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
    where id = p_id and (created_by = v_uid or admin_calendar_is_editor(v_uid))
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
  delete from public.admin_calendar_events where id = p_id and (created_by = v_uid or admin_calendar_is_editor(v_uid));
  if not found then return json_build_object('ok', false, 'error', '只能刪除自己新增的事項'); end if;
  return json_build_object('ok', true);
end; $$;

-- p_data：{title, startDate, endDate, lines: [..], warn}；p_hidden = true 表示隱藏這筆
create or replace function public.admin_calendar_override_save(p_token text, p_key text, p_hidden boolean, p_data jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid;
  v_key text := trim(coalesce(p_key, ''));
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_start date;
  v_end date;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if not admin_calendar_is_editor(v_uid) then return json_build_object('ok', false, 'error', '沒有修改行事曆的權限'); end if;
  if v_key = '' or length(v_key) > 80 then return json_build_object('ok', false, 'error', '資料錯誤'); end if;
  if jsonb_typeof(v_data) <> 'object' or length(v_data::text) > 8000 then
    return json_build_object('ok', false, 'error', '內容太長');
  end if;
  if not coalesce(p_hidden, false) then
    if left(trim(coalesce(v_data->>'title', '')), 60) = '' then return json_build_object('ok', false, 'error', '請填寫標題'); end if;
    begin
      v_start := (v_data->>'startDate')::date;
      v_end := coalesce(nullif(v_data->>'endDate', '')::date, v_start);
    exception when others then
      return json_build_object('ok', false, 'error', '日期格式不正確');
    end;
    if v_start is null then return json_build_object('ok', false, 'error', '請選擇日期'); end if;
    if v_end < v_start then return json_build_object('ok', false, 'error', '結束日不能早於開始日'); end if;
    if v_end - v_start > 31 then return json_build_object('ok', false, 'error', '一次最多 32 天'); end if;
  end if;
  insert into public.admin_calendar_overrides (item_key, hidden, data, updated_by_name)
  values (v_key, coalesce(p_hidden, false), v_data, coalesce(admin_qa_reviewer_label(p_token), ''))
  on conflict (item_key) do update set
    hidden = excluded.hidden,
    data = case when excluded.hidden then public.admin_calendar_overrides.data else excluded.data end,
    updated_by_name = excluded.updated_by_name,
    updated_at = now();
  return json_build_object('ok', true);
end; $$;

create or replace function public.admin_calendar_override_reset(p_token text, p_key text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if not admin_calendar_is_editor(v_uid) then return json_build_object('ok', false, 'error', '沒有修改行事曆的權限'); end if;
  delete from public.admin_calendar_overrides where item_key = trim(coalesce(p_key, ''));
  return json_build_object('ok', true);
end; $$;

revoke all on function public.admin_calendar_override_save(text, text, boolean, jsonb) from public;
revoke all on function public.admin_calendar_override_reset(text, text) from public;
grant execute on function public.admin_calendar_override_save(text, text, boolean, jsonb) to anon, authenticated;
grant execute on function public.admin_calendar_override_reset(text, text) to anon, authenticated;
