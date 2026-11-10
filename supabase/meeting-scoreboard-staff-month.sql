-- 會議計分中心：部別、每月手動分數／獎金，並在資料層限制可見與寫入。
-- 請由有權限的人在 Supabase SQL editor 執行這份。不要整份重跑舊的 meeting-scoreboard.sql。
-- 不刪 msb_people／msb_projects／msb_entries 的舊列，也不依姓名自動綁帳號。

alter table public.msb_people
  add column if not exists account_id uuid references public.toolbox_accounts(id) on delete set null,
  add column if not exists department text not null default '';

create index if not exists msb_people_account_idx on public.msb_people (account_id);

create table if not exists public.msb_month_scores (
  id bigserial primary key,
  period_month text not null check (period_month ~ '^\d{4}-\d{2}$'),
  person_id bigint not null references public.msb_people(id) on delete restrict,
  account_id uuid references public.toolbox_accounts(id) on delete set null,
  department text not null default '',
  name text not null,
  score numeric(12, 2),
  bonus numeric(12, 2),
  bonus_status text not null default '' check (bonus_status in ('', '未發放', '待發放', '已發放')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.toolbox_accounts(id) on delete set null,
  unique (period_month, person_id)
);

create index if not exists msb_month_scores_month_idx on public.msb_month_scores (period_month, person_id);

alter table public.msb_month_scores enable row level security;
revoke all on public.msb_month_scores from public, anon, authenticated;

create or replace function public.msb_can_view_all(p_team text, p_job_title text)
returns boolean
language plpgsql
immutable
as $$
declare
  t text := trim(coalesce(p_team, ''));
  j text := trim(coalesce(p_job_title, ''));
begin
  if j = '工讀生' then
    return false;
  end if;
  if t = '總經理室' then
    return true;
  end if;
  if j in (
    '營業區協理', '區協理',
    '營業處經理', '處經理',
    '儲備處經理', '儲備營業處經理'
  ) then
    return true;
  end if;
  if t in ('行政管理部', '財務部')
     and j in (
       '經理', '部長', '協理',
       '處經理', '營業處經理', '副理',
       '區協理', '營業區協理',
       '儲備處經理', '儲備營業處經理'
     ) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.msb_can_edit(p_team text, p_job_title text)
returns boolean
language plpgsql
immutable
as $$
begin
  return public.msb_can_view_all(p_team, p_job_title);
end;
$$;

revoke all on function public.msb_can_view_all(text, text) from public, anon, authenticated;
revoke all on function public.msb_can_edit(text, text) from public, anon, authenticated;

create or replace function public.msb_actor(p_uid uuid, out o_team text, out o_title text, out o_name text, out o_can_all boolean, out o_can_edit boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  select trim(coalesce(a.team, '')), trim(coalesce(a.job_title, '')), trim(coalesce(nullif(a.name, ''), a.username, ''))
    into o_team, o_title, o_name
  from public.toolbox_accounts a
  where a.id = p_uid and a.status = 'active';
  o_can_all := public.msb_can_view_all(o_team, o_title);
  o_can_edit := public.msb_can_edit(o_team, o_title);
end;
$$;

revoke all on function public.msb_actor(uuid) from public, anon, authenticated;

create or replace function public.msb_resolve_person(p_board text, p_person_id bigint, p_name text)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 40);
  v_id bigint;
  v_n int;
begin
  if p_person_id is not null then
    select p.id into v_id
    from public.msb_people p
    where p.id = p_person_id and p.board_key = p_board and p.active = true;
    return v_id;
  end if;
  if v_name = '' then
    return null;
  end if;
  select count(*) into v_n
  from public.msb_people p
  where p.board_key = p_board and p.active = true and p.name = v_name;
  if v_n <> 1 then
    return null;
  end if;
  select p.id into v_id
  from public.msb_people p
  where p.board_key = p_board and p.active = true and p.name = v_name;
  return v_id;
end;
$$;

revoke all on function public.msb_resolve_person(text, bigint, text) from public, anon, authenticated;

create or replace function public.msb_list(p_token text, p_board text, p_month text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  v_board text := public.msb_board_ok(p_board);
  v_raw text := nullif(trim(coalesce(p_month, '')), '');
  v_all boolean := false;
  v_score_month text;
  v_team text;
  v_title text;
  v_name text;
  v_can_all boolean;
  v_can_edit boolean;
  v_people json;
  v_projects json;
  v_entries json;
begin
  select o_team, o_title, o_name, o_can_all, o_can_edit
    into v_team, v_title, v_name, v_can_all, v_can_edit
  from public.msb_actor(v_uid);

  if v_raw is null then
    v_all := true;
    v_score_month := to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM');
  elsif v_raw ~ '^\d{4}-\d{2}\|all$' then
    v_all := true;
    v_score_month := left(v_raw, 7);
  elsif v_raw ~ '^\d{4}-\d{2}$' then
    v_score_month := v_raw;
  else
    return json_build_object('ok', false, 'error', '月份格式錯誤');
  end if;

  select coalesce(json_agg(json_build_object(
    'id', p.id,
    'name', p.name,
    'title', coalesce(nullif(p.job_title, ''), '其他'),
    'sort', p.sort_order,
    'active', p.active,
    'department', coalesce(p.department, ''),
    'accountId', p.account_id,
    'score', ms.score,
    'bonus', ms.bonus,
    'bonusStatus', coalesce(ms.bonus_status, ''),
    'monthNote', coalesce(ms.note, '')
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
  left join public.msb_month_scores ms
    on ms.person_id = p.id and ms.period_month = v_score_month
  where p.board_key = v_board
    and p.active = true
    and (coalesce(v_can_all, false) or p.account_id = v_uid);

  select coalesce(json_agg(json_build_object(
    'id', p.id, 'name', p.name, 'sort', p.sort_order, 'active', p.active
  ) order by p.sort_order, p.id), '[]'::json)
    into v_projects
  from public.msb_projects p
  where p.board_key = v_board and p.active = true
    and coalesce(v_can_all, false);

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
      coalesce(pe.department, '') as "personDepartment",
      e.project_id as "projectId",
      pr.name as "projectName",
      e.created_by_name as "createdByName",
      e.created_at as "createdAt"
    from public.msb_entries e
    join public.msb_people pe on pe.id = e.person_id
    join public.msb_projects pr on pr.id = e.project_id
    where e.board_key = v_board
      and (coalesce(v_can_all, false) or pe.account_id = v_uid)
      and (
        v_all
        or to_char(e.score_date, 'YYYY-MM') = v_score_month
      )
  ) x;

  return json_build_object(
    'ok', true,
    'board', v_board,
    'month', case when v_all then null else v_score_month end,
    'scoreMonth', v_score_month,
    'allMonths', v_all,
    'canViewAll', v_can_all,
    'canEdit', v_can_edit,
    'viewerId', v_uid,
    'viewerName', v_name,
    'viewerTeam', v_team,
    'people', v_people,
    'projects', v_projects,
    'entries', v_entries
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
  v_can_edit boolean;
  v_id bigint;
  v_sort int;
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
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
  v_can_edit boolean;
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
  if exists (select 1 from public.msb_entries where person_id = p_id)
     or exists (select 1 from public.msb_month_scores where person_id = p_id) then
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
  v_can_edit boolean;
  v_id bigint;
  v_sort int;
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
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
  v_can_edit boolean;
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
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
  v_can_edit boolean;
begin
  select o_can_edit, o_name into v_can_edit, v_user_name from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
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
  v_can_edit boolean;
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
  delete from public.msb_entries where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到紀錄');
  end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.msb_apply_month_score(
  p_uid uuid,
  p_board text,
  p_person_id bigint,
  p_name text,
  p_month text,
  p_score text,
  p_bonus text,
  p_status text,
  p_note text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := left(trim(coalesce(p_month, '')), 7);
  v_person bigint;
  v_score numeric(12, 2);
  v_bonus numeric(12, 2);
  v_status text := trim(coalesce(p_status, ''));
  v_note text := left(trim(coalesce(p_note, '')), 500);
  v_dept text;
  v_account uuid;
  v_person_name text;
begin
  if v_month !~ '^\d{4}-\d{2}$' then
    return json_build_object('ok', false, 'error', '月份格式須為 YYYY-MM');
  end if;
  if v_status not in ('', '未發放', '待發放', '已發放') then
    return json_build_object('ok', false, 'error', '獎金狀態只能是未發放、待發放或已發放');
  end if;
  v_person := public.msb_resolve_person(p_board, p_person_id, p_name);
  if v_person is null then
    return json_build_object('ok', false, 'error', '對不到人員：' || coalesce(nullif(trim(coalesce(p_name, '')), ''), '未填姓名'));
  end if;
  begin
    v_score := nullif(trim(coalesce(p_score, '')), '')::numeric;
  exception when others then
    return json_build_object('ok', false, 'error', '分數格式錯誤');
  end;
  begin
    v_bonus := nullif(trim(coalesce(p_bonus, '')), '')::numeric;
  exception when others then
    return json_build_object('ok', false, 'error', '獎金格式錯誤');
  end;
  if v_bonus is not null and v_bonus < 0 then
    return json_build_object('ok', false, 'error', '獎金不可為負數');
  end if;
  if v_bonus = 0 then
    v_bonus := null;
  end if;
  select coalesce(p.department, ''), p.account_id, p.name
    into v_dept, v_account, v_person_name
  from public.msb_people p
  where p.id = v_person;

  insert into public.msb_month_scores (
    period_month, person_id, account_id, department, name, score, bonus, bonus_status, note, updated_by
  ) values (
    v_month, v_person, v_account, v_dept, v_person_name, v_score, v_bonus, v_status, v_note, p_uid
  )
  on conflict (period_month, person_id) do update
    set account_id = excluded.account_id,
        department = excluded.department,
        name = excluded.name,
        score = excluded.score,
        bonus = excluded.bonus,
        bonus_status = excluded.bonus_status,
        note = excluded.note,
        updated_at = now(),
        updated_by = excluded.updated_by;
  return json_build_object('ok', true, 'personId', v_person);
end;
$$;

revoke all on function public.msb_apply_month_score(uuid, text, bigint, text, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.msb_month_score_upsert(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_board text;
  v_can_edit boolean;
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
  v_board := public.msb_board_ok(left(trim(coalesce(d->>'board', '')), 20));
  return public.msb_apply_month_score(
    v_uid,
    v_board,
    nullif(d->>'personId', '')::bigint,
    d->>'name',
    d->>'periodMonth',
    d->>'score',
    d->>'bonus',
    d->>'bonusStatus',
    d->>'note'
  );
exception when others then
  return json_build_object('ok', false, 'error', '分數或人員格式錯誤');
end;
$$;

create or replace function public.msb_month_score_upsert_batch(p_token text, p_rows jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  v_can_edit boolean;
  v_rows jsonb;
  v_row jsonb;
  v_i int;
  v_saved int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_res json;
  v_board text;
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
  v_rows := case when jsonb_typeof(p_rows) = 'array' then p_rows else coalesce(p_rows->'rows', '[]'::jsonb) end;
  if jsonb_array_length(v_rows) > 500 then
    return json_build_object('ok', false, 'error', '一次最多 500 筆');
  end if;
  for v_i in 0 .. jsonb_array_length(v_rows) - 1 loop
    v_row := v_rows->v_i;
    begin
      v_board := public.msb_board_ok(left(trim(coalesce(v_row->>'board', p_rows->>'board', '')), 20));
      v_res := public.msb_apply_month_score(
        v_uid,
        v_board,
        nullif(v_row->>'personId', '')::bigint,
        v_row->>'name',
        coalesce(v_row->>'periodMonth', p_rows->>'periodMonth'),
        v_row->>'score',
        v_row->>'bonus',
        v_row->>'bonusStatus',
        v_row->>'note'
      );
      if coalesce((v_res->>'ok')::boolean, false) then
        v_saved := v_saved + 1;
      else
        v_errors := v_errors || jsonb_build_array(coalesce(v_res->>'error', '寫入失敗'));
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_array('第 ' || (v_i + 1) || ' 列格式錯誤');
    end;
  end loop;
  return json_build_object('ok', true, 'saved', v_saved, 'errors', v_errors);
end;
$$;

grant execute on function public.msb_list(text, text, text) to anon, authenticated;
grant execute on function public.msb_person_add(text, text, text) to anon, authenticated;
grant execute on function public.msb_person_remove(text, bigint) to anon, authenticated;
grant execute on function public.msb_project_add(text, text, text) to anon, authenticated;
grant execute on function public.msb_project_remove(text, bigint) to anon, authenticated;
grant execute on function public.msb_entry_save(text, jsonb) to anon, authenticated;
grant execute on function public.msb_entry_delete(text, bigint) to anon, authenticated;
grant execute on function public.msb_month_score_upsert(text, jsonb) to anon, authenticated;
grant execute on function public.msb_month_score_upsert_batch(text, jsonb) to anon, authenticated;
