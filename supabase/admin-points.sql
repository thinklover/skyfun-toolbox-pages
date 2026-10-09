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
  check (item in ('行政QA', '代管解約', '案件意見修正', '清冊意見修正', '包租解約'));

create index if not exists admin_points_manual_date_idx on public.admin_points_manual (work_date);

alter table public.admin_points_staff enable row level security;
alter table public.admin_points_manual enable row level security;
revoke all on public.admin_points_staff from anon, authenticated;
revoke all on public.admin_points_manual from anon, authenticated;

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
        'id', s.id, 'name', s.name, 'status', s.status, 'kind', s.kind, 'note', s.note
      ) order by s.status, s.kind, s.name)
      from public.admin_points_staff s
    ), '[]'::json),
    'manual', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'date', m.work_date, 'name', m.staff_name, 'item', m.item,
        'qty', m.qty, 'points', m.points, 'note', m.note, 'createdBy', m.created_by
      ) order by m.work_date, m.id)
      from public.admin_points_manual m
      where m.work_date between p_start and p_end
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

create or replace function public.admin_points_admin_save_staff(
  p_secret text,
  p_id uuid,
  p_name text,
  p_status text,
  p_kind text,
  p_note text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 30);
  v_id uuid;
begin
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
    insert into public.admin_points_staff (name, status, kind, note)
    values (v_name, p_status, p_kind, left(trim(coalesce(p_note, '')), 200))
    on conflict (name) do update
      set status = excluded.status, kind = excluded.kind, note = excluded.note, updated_at = now()
    returning id into v_id;
  else
    update public.admin_points_staff
      set name = v_name, status = p_status, kind = p_kind,
          note = left(trim(coalesce(p_note, '')), 200), updated_at = now()
      where id = p_id
      returning id into v_id;
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

create or replace function public.admin_points_admin_add_manual(
  p_secret text,
  p_token text,
  p_date date,
  p_name text,
  p_item text,
  p_qty int default 1,
  p_note text default '',
  p_points int default null
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
  v_id bigint;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if v_unit = 0 then
    return json_build_object('ok', false, 'error', '項目無效');
  end if;
  if p_item = '行政QA' then
    if coalesce(p_points, 0) not between 1 and 4 then
      return json_build_object('ok', false, 'error', '行政QA 點數需為 1～4');
    end if;
    v_unit := p_points;
    v_qty := 1;
  end if;
  if p_date is null then
    return json_build_object('ok', false, 'error', '請選日期');
  end if;
  if v_qty < 1 or v_qty > 50 then
    return json_build_object('ok', false, 'error', '件數需為 1～50');
  end if;
  if not exists (select 1 from public.admin_points_staff where name = v_name) then
    return json_build_object('ok', false, 'error', '人力明細查無此人');
  end if;
  insert into public.admin_points_manual (work_date, staff_name, item, qty, points, note, created_by)
  values (p_date, v_name, p_item, v_qty, v_unit * v_qty, left(trim(coalesce(p_note, '')), 200),
          public.admin_qa_reviewer_label(p_token))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'points', v_unit * v_qty);
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

grant execute on function public.admin_points_view(text, date, date) to anon, authenticated;
grant execute on function public.admin_points_admin_list(text, date, date) to anon, authenticated;
grant execute on function public.admin_points_admin_save_staff(text, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_points_admin_delete_staff(text, uuid) to anon, authenticated;
grant execute on function public.admin_points_admin_add_manual(text, text, date, text, text, int, text, int) to anon, authenticated;
grant execute on function public.admin_points_admin_delete_manual(text, bigint) to anon, authenticated;
