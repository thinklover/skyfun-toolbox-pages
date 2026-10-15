-- 行政點數表：人力明細、組長手填點數（含行政QA 1～4 點）；自動點數由 Worker 讀星鴻審核時間紀錄／補助審核後在前端計算
-- 讀取：工具箱登入者（p_token）；維護：後台密碼（p_secret，同行政 QA 檢核後台）

create table if not exists public.admin_points_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default '在職' check (status in ('在職', '離職')),
  kind text not null default '正職' check (kind in ('正職', '工讀生')),
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_points_manual (
  id bigserial primary key,
  work_date date not null,
  staff_name text not null,
  item text not null,
  qty int not null default 1 check (qty between 1 and 50),
  points int not null check (points between 1 and 150),
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

alter table public.admin_points_manual drop constraint if exists admin_points_manual_item_check;
alter table public.admin_points_manual add constraint admin_points_manual_item_check
  check (item in ('行政QA', '代管解約', '案件意見修正', '清冊意見修正', '包租解約', '其他'));

create index if not exists admin_points_manual_date_idx on public.admin_points_manual (work_date);

alter table public.admin_points_staff add column if not exists region text not null default '';
alter table public.admin_points_staff add column if not exists office text not null default '';
alter table public.admin_points_staff add column if not exists hire_date date;
alter table public.admin_points_staff add column if not exists project text not null default '';
alter table public.admin_points_staff add column if not exists leader text not null default '';
alter table public.admin_points_manual add column if not exists leader text not null default '';

-- 組長登錄客訴與懲處：客訴件數依週加總，懲處取業績月內最重者（大過＞小過）
create table if not exists public.admin_points_incident (
  id bigserial primary key,
  work_date date not null,
  staff_name text not null,
  complaints int not null default 0 check (complaints between 0 and 50),
  penalty text not null default '' check (penalty in ('', '小過', '大過')),
  compensation int not null default 0 check (compensation between 0 and 10000000),
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  check (complaints > 0 or penalty <> '' or compensation > 0)
);

create index if not exists admin_points_incident_date_idx on public.admin_points_incident (work_date);

-- 組長審件抽查：每筆登錄抽查件數與正確件數，良率＝正確／抽查
create table if not exists public.admin_points_check (
  id bigserial primary key,
  work_date date not null,
  staff_name text not null,
  checked int not null check (checked between 1 and 200),
  correct int not null check (correct >= 0 and correct <= checked),
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists admin_points_check_date_idx on public.admin_points_check (work_date);

-- 教育訓練：每人每個技能節點一筆（完成日期），不受業績月限制
create table if not exists public.admin_points_training (
  id bigserial primary key,
  staff_name text not null,
  skill text not null check (skill in ('guide', 'obj', 'tenant', 'pre', 'rev', 'p4', 'p5', 'term', 'lvr', 'roster')),
  trained_date date not null,
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  unique (staff_name, skill)
);

-- 既有資料表補上「執行要點」(guide)
alter table public.admin_points_training drop constraint if exists admin_points_training_skill_check;
alter table public.admin_points_training add constraint admin_points_training_skill_check
  check (skill in ('guide', 'obj', 'tenant', 'pre', 'rev', 'p4', 'p5', 'term', 'lvr', 'roster'));

alter table public.admin_points_training enable row level security;
revoke all on public.admin_points_training from anon, authenticated;

alter table public.admin_points_staff enable row level security;
alter table public.admin_points_manual enable row level security;
alter table public.admin_points_check enable row level security;
alter table public.admin_points_incident enable row level security;
revoke all on public.admin_points_staff from anon, authenticated;
revoke all on public.admin_points_manual from anon, authenticated;
revoke all on public.admin_points_check from anon, authenticated;
revoke all on public.admin_points_incident from anon, authenticated;

create or replace function public.admin_points_item_points(p_item text)
returns int
language sql
immutable
as $$
  select case p_item
    when '行政QA' then 1
    when '代管解約' then 1
    when '案件意見修正' then 1
    when '清冊意見修正' then 1
    when '包租解約' then 3
    when '其他' then 1
    else 0
  end;
$$;

create or replace function public.admin_points_payload(p_start date, p_end date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'ok', true,
    'staff', coalesce((
      select json_agg(json_build_object(
        'id', s.id, 'name', s.name, 'status', s.status, 'kind', s.kind, 'note', s.note,
        'region', s.region, 'office', s.office, 'hireDate', s.hire_date, 'project', s.project,
        'leader', s.leader
      ) order by s.status, s.kind, s.name)
      from public.admin_points_staff s
    ), '[]'::json),
    'incidents', coalesce((
      select json_agg(json_build_object(
        'id', i.id, 'date', i.work_date, 'name', i.staff_name, 'complaints', i.complaints,
        'penalty', i.penalty, 'compensation', i.compensation, 'note', i.note, 'createdBy', i.created_by
      ) order by i.work_date, i.id)
      from public.admin_points_incident i
      where i.work_date between p_start and p_end
    ), '[]'::json),
    'checks', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'date', c.work_date, 'name', c.staff_name, 'checked', c.checked,
        'correct', c.correct, 'note', c.note, 'createdBy', c.created_by
      ) order by c.work_date, c.id)
      from public.admin_points_check c
      where c.work_date between p_start and p_end
    ), '[]'::json),
    'manual', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'date', m.work_date, 'name', m.staff_name, 'item', m.item,
        'qty', m.qty, 'points', m.points, 'note', m.note, 'leader', m.leader, 'createdBy', m.created_by
      where m.work_date between p_start and p_end
    ), '[]'::json),
    'training', coalesce((
      select json_agg(json_build_object(
        'id', t.id, 'name', t.staff_name, 'skill', t.skill, 'date', t.trained_date,
        'note', t.note, 'createdBy', t.created_by
      ) order by t.staff_name, t.skill)
      from public.admin_points_training t
    ), '[]'::json)
  );
$$;

revoke all on function public.admin_points_payload(date, date) from public, anon, authenticated;

create or replace function public.admin_points_view(p_token text, p_start date, p_end date)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_qa_user_id(p_token) is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 62 then
    return json_build_object('ok', false, 'error', '日期區間無效');
  end if;
  return public.admin_points_payload(p_start, p_end);
end;
$$;

create or replace function public.admin_points_admin_list(p_secret text, p_start date, p_end date)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 62 then
    return json_build_object('ok', false, 'error', '日期區間無效');
  end if;
  return public.admin_points_payload(p_start, p_end);
end;
$$;

drop function if exists public.admin_points_admin_save_staff(text, uuid, text, text, text, text);

create or replace function public.admin_points_admin_save_staff(
drop function if exists public.admin_points_admin_save_staff(text, uuid, text, text, text, text, text, text, date, text);

create or replace function public.admin_points_admin_save_staff(
  p_secret text,
  p_id uuid,
  p_name text,
  p_status text,
  p_kind text,
  p_note text default '',
  p_region text default '',
  p_office text default '',
  p_hire_date date default null,
  p_project text default '',
  p_leader text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 30);
  v_region text := left(trim(coalesce(p_region, '')), 30);
  v_office text := left(trim(coalesce(p_office, '')), 60);
  v_project text := left(trim(coalesce(p_project, '')), 100);
  v_leader text := left(trim(coalesce(p_leader, '')), 30);
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if v_name = '' then
    return json_build_object('ok', false, 'error', '請填姓名');
  end if;
  if coalesce(p_status, '') not in ('在職', '離職') or coalesce(p_kind, '') not in ('正職', '工讀生') then
    return json_build_object('ok', false, 'error', '狀態或身分無效');
  end if;
  if p_id is null then
    insert into public.admin_points_staff (name, status, kind, note, region, office, hire_date, project)
    values (v_name, p_status, p_kind, left(trim(coalesce(p_note, '')), 200), v_region, v_office, p_hire_date, v_project)
    insert into public.admin_points_staff (name, status, kind, note, region, office, hire_date, project, leader)
    values (v_name, p_status, p_kind, left(trim(coalesce(p_note, '')), 200), v_region, v_office, p_hire_date, v_project, v_leader)
    on conflict (name) do update
      set status = excluded.status, kind = excluded.kind, note = excluded.note,
          region = excluded.region, office = excluded.office, hire_date = excluded.hire_date,
          project = excluded.project, leader = excluded.leader, updated_at = now()
    returning id into v_id;
  else
    update public.admin_points_staff
      set name = v_name, status = p_status, kind = p_kind,
          note = left(trim(coalesce(p_note, '')), 200),
          region = v_region, office = v_office, hire_date = p_hire_date, project = v_project,
          leader = v_leader, updated_at = now()
    if v_id is null then
      return json_build_object('ok', false, 'error', '找不到人員');
    end if;
  end if;
  return json_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  return json_build_object('ok', false, 'error', '姓名已存在');
end;
$$;

create or replace function public.admin_points_admin_delete_staff(p_secret text, p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  delete from public.admin_points_staff where id = p_id;
  return json_build_object('ok', true);
end;
$$;

drop function if exists public.admin_points_admin_add_manual(text, text, date, text, text, int, text);

drop function if exists public.admin_points_admin_add_manual(text, text, date, text, text, int, text, int);

-- 組長選手填項目、組內行政與給予點數（p_points 為這筆總點數；未給則依項目預設 × 件數）
create or replace function public.admin_points_admin_add_manual(
  p_secret text,
  p_token text,
  p_date date,
  p_name text,
  p_item text,
  p_qty int default 1,
  p_note text default '',
  p_points int default null,
  p_leader text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit int := public.admin_points_item_points(p_item);
  v_qty int := coalesce(p_qty, 1);
  v_name text := trim(coalesce(p_name, ''));
  v_leader text := trim(coalesce(p_leader, ''));
  v_points int;
  v_id bigint;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if v_unit = 0 then
    return json_build_object('ok', false, 'error', '項目無效');
  end if;
  if p_item = '其他' and trim(coalesce(p_note, '')) = '' then
    return json_build_object('ok', false, 'error', '選「其他」請在備註寫明是什麼點數');
  end if;
  if p_date is null then
    return json_build_object('ok', false, 'error', '請選日期');
  end if;
  if v_qty < 1 or v_qty > 50 then
    return json_build_object('ok', false, 'error', '件數需為 1～50');
  end if;
  v_points := coalesce(p_points, v_unit * v_qty);
  if v_points < 1 or v_points > 150 then
    return json_build_object('ok', false, 'error', '點數需為 1～150');
  end if;
  if not exists (select 1 from public.admin_points_staff where name = v_name) then
    return json_build_object('ok', false, 'error', '人力明細查無此人');
  end if;
  if v_leader <> '' and not exists (
    select 1 from public.admin_points_staff where name = v_name and leader = v_leader
  ) then
    return json_build_object('ok', false, 'error', v_name || ' 不在 ' || v_leader || ' 的組內');
  end if;
  insert into public.admin_points_manual (work_date, staff_name, item, qty, points, note, leader, created_by)
  values (p_date, v_name, p_item, v_qty, v_points, left(trim(coalesce(p_note, '')), 200), v_leader,
          public.admin_qa_reviewer_label(p_token))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'points', v_points);
end;
$$;

create or replace function public.admin_points_admin_delete_manual(p_secret text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  delete from public.admin_points_manual where id = p_id;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_points_admin_add_check(
  p_secret text,
  p_token text,
  p_date date,
  p_name text,
  p_checked int,
  p_correct int,
  p_note text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_id bigint;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_date is null then
    return json_build_object('ok', false, 'error', '請選日期');
  end if;
  if coalesce(p_checked, 0) not between 1 and 200 then
    return json_build_object('ok', false, 'error', '抽查件數需為 1～200');
  end if;
  if coalesce(p_correct, -1) < 0 or p_correct > p_checked then
    return json_build_object('ok', false, 'error', '正確件數需介於 0 和抽查件數之間');
  end if;
  if not exists (select 1 from public.admin_points_staff where name = v_name) then
    return json_build_object('ok', false, 'error', '人力明細查無此人');
  end if;
  insert into public.admin_points_check (work_date, staff_name, checked, correct, note, created_by)
  values (p_date, v_name, p_checked, p_correct, left(trim(coalesce(p_note, '')), 200),
          public.admin_qa_reviewer_label(p_token))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.admin_points_admin_delete_check(p_secret text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  delete from public.admin_points_check where id = p_id;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_points_admin_add_incident(
  p_secret text,
  p_token text,
  p_date date,
  p_name text,
  p_complaints int default 0,
  p_penalty text default '',
  p_compensation int default 0,
  p_note text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_penalty text := coalesce(p_penalty, '');
  v_id bigint;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_date is null then
    return json_build_object('ok', false, 'error', '請選日期');
  end if;
  if coalesce(p_complaints, 0) not between 0 and 50 then
    return json_build_object('ok', false, 'error', '客訴件數需為 0～50');
  end if;
  if v_penalty not in ('', '小過', '大過') then
    return json_build_object('ok', false, 'error', '懲處只能是小過或大過');
  end if;
  if coalesce(p_compensation, 0) not between 0 and 10000000 then
    return json_build_object('ok', false, 'error', '賠償金額無效');
  end if;
  if coalesce(p_complaints, 0) = 0 and v_penalty = '' and coalesce(p_compensation, 0) = 0 then
    return json_build_object('ok', false, 'error', '請填客訴件數、懲處或賠償金額');
  end if;
  if not exists (select 1 from public.admin_points_staff where name = v_name) then
    return json_build_object('ok', false, 'error', '人力明細查無此人');
  end if;
  insert into public.admin_points_incident (work_date, staff_name, complaints, penalty, compensation, note, created_by)
  values (p_date, v_name, coalesce(p_complaints, 0), v_penalty, coalesce(p_compensation, 0),
          left(trim(coalesce(p_note, '')), 200), public.admin_qa_reviewer_label(p_token))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.admin_points_admin_delete_incident(p_secret text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  delete from public.admin_points_incident where id = p_id;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_points_admin_set_training(
  p_secret text,
  p_token text,
  p_name text,
  p_skill text,
  p_date date,
  p_note text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_id bigint;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if coalesce(p_skill, '') not in ('guide', 'obj', 'tenant', 'pre', 'rev', 'p4', 'p5', 'term', 'lvr', 'roster') then
    return json_build_object('ok', false, 'error', '訓練項目無效');
  end if;
  if p_date is null then
    return json_build_object('ok', false, 'error', '請選訓練日期');
  end if;
  if not exists (select 1 from public.admin_points_staff where name = v_name) then
    return json_build_object('ok', false, 'error', '人力明細查無此人');
  end if;
  insert into public.admin_points_training (staff_name, skill, trained_date, note, created_by)
  values (v_name, p_skill, p_date, left(trim(coalesce(p_note, '')), 200), public.admin_qa_reviewer_label(p_token))
  on conflict (staff_name, skill) do update
    set trained_date = excluded.trained_date, note = excluded.note, created_by = excluded.created_by, created_at = now()
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.admin_points_admin_delete_training(p_secret text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  delete from public.admin_points_training where id = p_id;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_points_view(text, date, date) to anon, authenticated;
grant execute on function public.admin_points_admin_set_training(text, text, text, text, date, text) to anon, authenticated;
grant execute on function public.admin_points_admin_delete_training(text, bigint) to anon, authenticated;
grant execute on function public.admin_points_admin_list(text, date, date) to anon, authenticated;
grant execute on function public.admin_points_admin_save_staff(text, uuid, text, text, text, text, text, text, date, text, text) to anon, authenticated;
grant execute on function public.admin_points_admin_add_incident(text, text, date, text, int, text, int, text) to anon, authenticated;
grant execute on function public.admin_points_admin_delete_incident(text, bigint) to anon, authenticated;
grant execute on function public.admin_points_admin_add_check(text, text, date, text, int, int, text) to anon, authenticated;
grant execute on function public.admin_points_admin_delete_check(text, bigint) to anon, authenticated;
grant execute on function public.admin_points_admin_delete_staff(text, uuid) to anon, authenticated;
grant execute on function public.admin_points_admin_add_manual(text, text, date, text, text, int, text, int, text) to anon, authenticated;