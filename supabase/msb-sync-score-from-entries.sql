-- 加減分紀錄合計同步到總表分數（msb_month_scores.score），獎金不動

create or replace function public.msb_sync_month_score_from_entries(
  p_person_id bigint,
  p_month text,
  p_uid uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_month text := left(trim(coalesce(p_month, '')), 7);
  v_sum numeric(12, 2);
  v_dept text;
  v_account uuid;
  v_name text;
  v_bonus numeric(12, 2);
  v_status text;
  v_note text;
begin
  if p_person_id is null or v_month !~ '^\d{4}-\d{2}$' then
    return;
  end if;

  select sum(e.score) into v_sum
  from public.msb_entries e
  where e.person_id = p_person_id
    and to_char(e.score_date, 'YYYY-MM') = v_month;

  select
    coalesce(p.department, ''),
    p.account_id,
    p.name,
    ms.bonus,
    coalesce(ms.bonus_status, ''),
    coalesce(ms.note, '')
  into v_dept, v_account, v_name, v_bonus, v_status, v_note
  from public.msb_people p
  left join public.msb_month_scores ms
    on ms.person_id = p.id and ms.period_month = v_month
  where p.id = p_person_id;

  if v_name is null then
    return;
  end if;

  if v_sum is null and v_bonus is null and coalesce(v_status, '') = '' and coalesce(v_note, '') = '' then
    delete from public.msb_month_scores
    where person_id = p_person_id and period_month = v_month;
    return;
  end if;

  insert into public.msb_month_scores (
    period_month, person_id, account_id, department, name,
    score, bonus, bonus_status, note, updated_by
  ) values (
    v_month, p_person_id, v_account, v_dept, v_name,
    v_sum, v_bonus, v_status, v_note, p_uid
  )
  on conflict (period_month, person_id) do update
    set account_id = excluded.account_id,
        department = excluded.department,
        name = excluded.name,
        score = excluded.score,
        updated_at = now(),
        updated_by = excluded.updated_by;
end;
$function$;

revoke all on function public.msb_sync_month_score_from_entries(bigint, text, uuid) from public;

create or replace function public.msb_entry_save(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := public.msb_require_user(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_board_in text := left(trim(coalesce(d->>'board', 'all')), 20);
  v_board text;
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
  v_src_name text;
  v_mapped bigint;
  v_old_person bigint;
  v_old_month text;
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

  select p.board_key into v_board from public.msb_people p where p.id = v_person and p.active = true;
  if v_board is null then
    return json_build_object('ok', false, 'error', '加分人員不存在');
  end if;
  if v_board_in is distinct from 'all' and v_board_in is distinct from v_board then
    if not exists (
      select 1 from public.msb_people
      where id = v_person and board_key = public.msb_board_ok(v_board_in) and active
    ) then
      return json_build_object('ok', false, 'error', '加分人員不存在');
    end if;
    v_board := public.msb_board_ok(v_board_in);
  end if;

  if not exists (
    select 1 from public.msb_projects
    where id = v_project and board_key = v_board and active
  ) then
    select pr.name into v_src_name
    from public.msb_projects pr
    where pr.id = v_project and pr.active = true;
    if v_src_name is null then
      return json_build_object('ok', false, 'error', '專案不存在');
    end if;

    select pr2.id into v_mapped
    from public.msb_projects pr2
    where pr2.board_key = v_board
      and pr2.active = true
      and pr2.name = v_src_name
    order by pr2.sort_order, pr2.id
    limit 1;

    if v_mapped is null then
      select pr2.id into v_mapped
      from public.msb_projects pr2
      where pr2.board_key = v_board
        and pr2.active = true
        and pr2.name = '一般加減分'
      order by pr2.sort_order, pr2.id
      limit 1;
    end if;

    if v_mapped is null then
      insert into public.msb_projects (board_key, name, sort_order, active)
      values (v_board, '一般加減分', 0, true)
      returning id into v_mapped;
    end if;

    v_project := v_mapped;
  end if;

  if v_id is not null then
    select person_id, to_char(score_date, 'YYYY-MM')
      into v_old_person, v_old_month
    from public.msb_entries where id = v_id;
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
        board_key = v_board,
        updated_at = now()
    where id = v_id;
    if not found then
      return json_build_object('ok', false, 'error', '找不到要修改的紀錄');
    end if;
  end if;

  perform public.msb_sync_month_score_from_entries(v_person, to_char(v_date, 'YYYY-MM'), v_uid);
  if v_old_person is not null and v_old_month is not null
     and (v_old_person is distinct from v_person or v_old_month is distinct from to_char(v_date, 'YYYY-MM')) then
    perform public.msb_sync_month_score_from_entries(v_old_person, v_old_month, v_uid);
  end if;

  return json_build_object('ok', true, 'id', v_id);
end;
$function$;

create or replace function public.msb_entry_delete(p_token text, p_id bigint)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := public.msb_require_user(p_token);
  v_can_edit boolean;
  v_person bigint;
  v_month text;
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
  select person_id, to_char(score_date, 'YYYY-MM')
    into v_person, v_month
  from public.msb_entries where id = p_id;
  if v_person is null then
    return json_build_object('ok', false, 'error', '找不到紀錄');
  end if;
  delete from public.msb_entries where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到紀錄');
  end if;
  perform public.msb_sync_month_score_from_entries(v_person, v_month, v_uid);
  return json_build_object('ok', true);
end;
$function$;

grant execute on function public.msb_entry_save(text, jsonb) to anon, authenticated;
grant execute on function public.msb_entry_delete(text, bigint) to anon, authenticated;

-- 既有加減分回填總表分數
insert into public.msb_month_scores (
  period_month, person_id, account_id, department, name, score, bonus, bonus_status, note
)
select
  x.period_month,
  x.person_id,
  p.account_id,
  coalesce(p.department, ''),
  p.name,
  x.score_sum,
  ms.bonus,
  coalesce(ms.bonus_status, ''),
  coalesce(ms.note, '')
from (
  select person_id, to_char(score_date, 'YYYY-MM') as period_month, sum(score) as score_sum
  from public.msb_entries
  group by person_id, to_char(score_date, 'YYYY-MM')
) x
join public.msb_people p on p.id = x.person_id
left join public.msb_month_scores ms
  on ms.person_id = x.person_id and ms.period_month = x.period_month
on conflict (period_month, person_id) do update
  set score = excluded.score,
      account_id = excluded.account_id,
      department = excluded.department,
      name = excluded.name,
      updated_at = now();

-- 以觸發器確保之後新增／修改／刪除加減分都會同步總表分數
create or replace function public.msb_entries_sync_score_tg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.msb_sync_month_score_from_entries(old.person_id, to_char(old.score_date, 'YYYY-MM'), null);
    return old;
  end if;
  perform public.msb_sync_month_score_from_entries(new.person_id, to_char(new.score_date, 'YYYY-MM'), null);
  if tg_op = 'UPDATE'
     and (old.person_id is distinct from new.person_id
          or to_char(old.score_date, 'YYYY-MM') is distinct from to_char(new.score_date, 'YYYY-MM')) then
    perform public.msb_sync_month_score_from_entries(old.person_id, to_char(old.score_date, 'YYYY-MM'), null);
  end if;
  return new;
end;
$function$;

drop trigger if exists msb_entries_sync_score on public.msb_entries;
create trigger msb_entries_sync_score
after insert or update or delete on public.msb_entries
for each row execute function public.msb_entries_sync_score_tg();

notify pgrst, 'reload schema';
