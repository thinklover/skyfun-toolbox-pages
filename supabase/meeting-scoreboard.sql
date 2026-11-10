-- 會議計分中心（總經理室）：人員／專案／加減分紀錄。
-- 可見範圍已改由 meeting-scoreboard-staff-month.sql 強制。不要再整份重跑本檔，否則會恢復全公司可讀寫。
-- 依賴：toolbox_accounts、admin_qa_user_id(p_token)

create table if not exists public.msb_people (
  id bigserial primary key,
  board_key text not null check (board_key in ('system', 'monthly')),
  name text not null,
  job_title text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists msb_people_board_idx on public.msb_people (board_key, active, sort_order, id);

alter table public.msb_people enable row level security;
revoke all on public.msb_people from public, anon, authenticated;

create table if not exists public.msb_projects (
  id bigserial primary key,
  board_key text not null check (board_key in ('system', 'monthly')),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists msb_projects_board_idx on public.msb_projects (board_key, active, sort_order, id);

alter table public.msb_projects enable row level security;
revoke all on public.msb_projects from public, anon, authenticated;

create table if not exists public.msb_entries (
  id bigserial primary key,
  board_key text not null check (board_key in ('system', 'monthly')),
  person_id bigint not null references public.msb_people(id) on delete restrict,
  project_id bigint not null references public.msb_projects(id) on delete restrict,
  score_date date not null,
  score numeric(10, 2) not null,
  item text not null default '',
  note text not null default '',
  session_label text not null default '',
  created_by uuid references public.toolbox_accounts(id) on delete set null,
  created_by_name text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists msb_entries_board_date_idx on public.msb_entries (board_key, score_date desc, id desc);
create index if not exists msb_entries_person_idx on public.msb_entries (person_id);
create index if not exists msb_entries_project_idx on public.msb_entries (project_id);

alter table public.msb_entries enable row level security;
revoke all on public.msb_entries from public, anon, authenticated;

create or replace function public.msb_require_user(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
begin
  if v_uid is null then
    raise exception '請先登入工具箱';
  end if;
  if not exists (
    select 1 from public.toolbox_accounts a
    where a.id = v_uid and a.status = 'active'
  ) then
    raise exception '帳號未啟用';
  end if;
  return v_uid;
end;
$$;

create or replace function public.msb_board_ok(p_board text)
returns text
language plpgsql
immutable
as $$
begin
  if p_board in ('system', 'monthly') then
    return p_board;
  end if;
  raise exception '計分表不存在';
end;
$$;

create or replace function public.msb_list(p_token text, p_board text, p_month text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  v_board text := public.msb_board_ok(p_board);
  v_month text := nullif(trim(coalesce(p_month, '')), '');
  v_people json;
  v_projects json;
  v_entries json;
begin
  select coalesce(json_agg(json_build_object(
    'id', p.id,
    'name', p.name,
    'title', coalesce(nullif(p.job_title, ''), '其他'),
    'sort', p.sort_order,
    'active', p.active
  ) order by
    case coalesce(nullif(p.job_title, ''), '其他')
      when '營業區協理' then 1
      when '營業處經理' then 2
      when '儲備處經理' then 3
      when '行政專員組長' then 4
      else 9
    end,
    p.sort_order, p.id
  ), '[]'::json)
    into v_people
  from public.msb_people p
  where p.board_key = v_board and p.active = true;

  select coalesce(json_agg(json_build_object(
    'id', p.id, 'name', p.name, 'sort', p.sort_order, 'active', p.active
  ) order by p.sort_order, p.id), '[]'::json)
    into v_projects
  from public.msb_projects p
  where p.board_key = v_board and p.active = true;

  select coalesce(json_agg(row_to_json(x) order by x."scoreDate" desc, x.id desc), '[]'::json)
    into v_entries
  from (
    select
      e.id,
      e.score_date as "scoreDate",
      e.score,
      e.item,
      e.note,
      e.session_label as "sessionLabel",
      e.person_id as "personId",
      pe.name as "personName",
      coalesce(nullif(pe.job_title, ''), '') as "personTitle",
      e.project_id as "projectId",
      pr.name as "projectName",
      e.created_by_name as "createdByName",
      e.created_at as "createdAt"
    from public.msb_entries e
    join public.msb_people pe on pe.id = e.person_id
    join public.msb_projects pr on pr.id = e.project_id
    where e.board_key = v_board
      and (
        v_month is null
        or to_char(e.score_date, 'YYYY-MM') = left(v_month, 7)
      )
  ) x;

  return json_build_object(
    'ok', true,
    'board', v_board,
    'month', v_month,
    'people', v_people,
    'projects', v_projects,
    'entries', v_entries,
    'viewerId', v_uid
  );
end;
$$;

create or replace function public.msb_person_add(p_token text, p_board text, p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  v_board text := public.msb_board_ok(p_board);
  v_name text := left(trim(coalesce(p_name, '')), 40);
  v_id bigint;
  v_sort int;
begin
  if v_name = '' then
    return json_build_object('ok', false, 'error', '請填人員姓名');
  end if;
  select coalesce(max(sort_order), 0) + 1 into v_sort
  from public.msb_people where board_key = v_board;
  insert into public.msb_people (board_key, name, sort_order)
  values (v_board, v_name, v_sort)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'name', v_name);
end;
$$;

create or replace function public.msb_person_remove(p_token text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
begin
  if exists (select 1 from public.msb_entries where person_id = p_id) then
    update public.msb_people set active = false where id = p_id;
  else
    delete from public.msb_people where id = p_id;
  end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.msb_project_add(p_token text, p_board text, p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  v_board text := public.msb_board_ok(p_board);
  v_name text := left(trim(coalesce(p_name, '')), 60);
  v_id bigint;
  v_sort int;
begin
  if v_name = '' then
    return json_build_object('ok', false, 'error', '請填專案名稱');
  end if;
  select coalesce(max(sort_order), 0) + 1 into v_sort
  from public.msb_projects where board_key = v_board;
  insert into public.msb_projects (board_key, name, sort_order)
  values (v_board, v_name, v_sort)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'name', v_name);
end;
$$;

create or replace function public.msb_project_remove(p_token text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
begin
  if exists (select 1 from public.msb_entries where project_id = p_id) then
    update public.msb_projects set active = false where id = p_id;
  else
    delete from public.msb_projects where id = p_id;
  end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.msb_entry_save(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_board text := public.msb_board_ok(left(trim(coalesce(d->>'board', '')), 20));
  v_id bigint := nullif(d->>'id', '')::bigint;
  v_person bigint := nullif(d->>'personId', '')::bigint;
  v_project bigint := nullif(d->>'projectId', '')::bigint;
  v_date date;
  v_score numeric(10, 2);
  v_item text := left(trim(coalesce(d->>'item', '')), 80);
  v_note text := left(trim(coalesce(d->>'note', '')), 500);
  v_session text := left(trim(coalesce(d->>'sessionLabel', '')), 40);
  v_user_name text;
begin
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

  if v_person is null then return json_build_object('ok', false, 'error', '請選加分人員'); end if;
  if v_project is null then return json_build_object('ok', false, 'error', '請選專案／區塊'); end if;
  if v_date is null then return json_build_object('ok', false, 'error', '請填計分日期'); end if;
  if v_score is null or v_score = 0 then return json_build_object('ok', false, 'error', '分數不可為 0，減分請填負數'); end if;
  if v_item = '' then return json_build_object('ok', false, 'error', '請填加減分項目'); end if;

  if not exists (select 1 from public.msb_people where id = v_person and board_key = v_board and active) then
    return json_build_object('ok', false, 'error', '加分人員不存在');
  end if;
  if not exists (select 1 from public.msb_projects where id = v_project and board_key = v_board and active) then
    return json_build_object('ok', false, 'error', '專案不存在');
  end if;

  select trim(coalesce(nullif(a.name, ''), a.username)) into v_user_name
  from public.toolbox_accounts a where a.id = v_uid;

  if v_id is null then
    insert into public.msb_entries (
      board_key, person_id, project_id, score_date, score, item, note, session_label,
      created_by, created_by_name
    ) values (
      v_board, v_person, v_project, v_date, v_score, v_item, v_note, v_session,
      v_uid, coalesce(v_user_name, '')
    ) returning id into v_id;
  else
    update public.msb_entries
    set person_id = v_person,
        project_id = v_project,
        score_date = v_date,
        score = v_score,
        item = v_item,
        note = v_note,
        session_label = v_session,
        updated_at = now()
    where id = v_id and board_key = v_board;
    if not found then
      return json_build_object('ok', false, 'error', '找不到要修改的紀錄');
    end if;
  end if;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.msb_entry_delete(p_token text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
begin
  delete from public.msb_entries where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到紀錄');
  end if;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.msb_list(text, text, text) to anon, authenticated;
grant execute on function public.msb_person_add(text, text, text) to anon, authenticated;
grant execute on function public.msb_person_remove(text, bigint) to anon, authenticated;
grant execute on function public.msb_project_add(text, text, text) to anon, authenticated;
grant execute on function public.msb_project_remove(text, bigint) to anon, authenticated;
grant execute on function public.msb_entry_save(text, jsonb) to anon, authenticated;
grant execute on function public.msb_entry_delete(text, bigint) to anon, authenticated;
