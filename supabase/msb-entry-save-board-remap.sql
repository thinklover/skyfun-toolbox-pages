-- 總表加減分：專案與人員不同 board 時，改對到人員所屬表的同名專案／一般加減分
-- 已於 Supabase 套用；此檔供追蹤。

insert into public.msb_projects (board_key, name, sort_order, active)
select b.board_key, '一般加減分', 0, true
from (values ('system'::text), ('monthly'::text)) as b(board_key)
where not exists (
  select 1
  from public.msb_projects p
  where p.board_key = b.board_key
    and p.name = '一般加減分'
    and p.active = true
);

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

  return json_build_object('ok', true, 'id', v_id);
end;
$function$;

notify pgrst, 'reload schema';
