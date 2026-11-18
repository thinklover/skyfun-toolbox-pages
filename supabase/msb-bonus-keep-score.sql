-- 存獎金時可保留既有分數，避免空分數蓋掉加減分合計
-- 2026-11-18

drop function if exists public.msb_apply_month_score(uuid, text, bigint, text, text, text, text, text, text);

create or replace function public.msb_apply_month_score(
  p_uid uuid,
  p_board text,
  p_person_id bigint,
  p_name text,
  p_month text,
  p_score text,
  p_bonus text,
  p_status text,
  p_note text,
  p_keep_score boolean default false
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_board text := case when p_board = 'all' then 'system' else public.msb_board_ok(p_board) end;
  v_keep boolean := coalesce(p_keep_score, false);
  v_old_score numeric(12, 2);
begin
  if v_month !~ '^\d{4}-\d{2}$' then
    return json_build_object('ok', false, 'error', '月份格式須為 YYYY-MM');
  end if;
  if v_status not in ('', '未發放', '待發放', '已發放') then
    return json_build_object('ok', false, 'error', '獎金狀態只能是未發放、待發放或已發放');
  end if;
  v_person := public.msb_resolve_person(v_board, p_person_id, p_name);
  if v_person is null and p_person_id is not null then
    v_person := public.msb_resolve_person('all', p_person_id, p_name);
  end if;
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

  if v_keep then
    select ms.score into v_old_score
    from public.msb_month_scores ms
    where ms.person_id = v_person and ms.period_month = v_month;
    v_score := v_old_score;
  end if;

  insert into public.msb_month_scores (
    period_month, person_id, account_id, department, name, score, bonus, bonus_status, note, updated_by
  ) values (
    v_month, v_person, v_account, v_dept, v_person_name, v_score, v_bonus, v_status, v_note, p_uid
  )
  on conflict (period_month, person_id) do update
    set account_id = excluded.account_id,
        department = excluded.department,
        name = excluded.name,
        score = case when v_keep then msb_month_scores.score else excluded.score end,
        bonus = excluded.bonus,
        bonus_status = excluded.bonus_status,
        note = excluded.note,
        updated_at = now(),
        updated_by = excluded.updated_by;
  return json_build_object('ok', true, 'personId', v_person);
end;
$function$;

create or replace function public.msb_month_score_upsert(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := public.msb_require_user(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_board text;
  v_can_edit boolean;
  v_keep boolean := false;
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
  v_board := left(trim(coalesce(d->>'board', 'all')), 20);
  if v_board = '' then v_board := 'all'; end if;
  begin
    v_keep := coalesce((d->>'keepScore')::boolean, false);
  exception when others then
    v_keep := false;
  end;
  return public.msb_apply_month_score(
    v_uid,
    v_board,
    nullif(d->>'personId', '')::bigint,
    d->>'name',
    d->>'periodMonth',
    d->>'score',
    d->>'bonus',
    d->>'bonusStatus',
    d->>'note',
    v_keep
  );
exception when others then
  return json_build_object('ok', false, 'error', '分數或人員格式錯誤');
end;
$function$;

grant execute on function public.msb_apply_month_score(uuid, text, bigint, text, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.msb_month_score_upsert(text, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
