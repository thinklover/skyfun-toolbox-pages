-- 模擬實作分課程：obj 物件審核、tenant 房客審核、pre 合約預審，共用 sim_obj_* 題庫、作答、評分
-- 需先套用 sim-obj.sql。物審原本的資料一律是 course = 'obj'，舊的呼叫方式（不帶 p_course）照常運作。

alter table public.sim_obj_cases add column if not exists course text not null default 'obj';
alter table public.sim_obj_attempts add column if not exists course text not null default 'obj';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sim_obj_cases_course_chk') then
    alter table public.sim_obj_cases add constraint sim_obj_cases_course_chk check (course in ('obj', 'tenant', 'pre'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sim_obj_attempts_course_chk') then
    alter table public.sim_obj_attempts add constraint sim_obj_attempts_course_chk check (course in ('obj', 'tenant', 'pre'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'sim_obj_cases_source_id_key') then
    alter table public.sim_obj_cases drop constraint sim_obj_cases_source_id_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sim_obj_cases_course_source_key') then
    alter table public.sim_obj_cases add constraint sim_obj_cases_course_source_key unique (course, source_id);
  end if;
end $$;
create index if not exists sim_obj_attempts_course_idx on public.sim_obj_attempts (user_id, course, started_at desc);

create or replace function public.sim_course_ok(p_course text)
returns boolean language sql immutable as $$ select coalesce(p_course, '') in ('obj', 'tenant', 'pre') $$;

-- 題目資料的主體：物件審核看 obj、房客審核看 tenant、合約預審看 contract
create or replace function public.sim_course_root(p_course text)
returns text language sql immutable as $$
  select case p_course when 'tenant' then 'tenant' when 'pre' then 'contract' else 'obj' end
$$;

drop function if exists public.sim_obj_start(text, boolean);
create or replace function public.sim_obj_start(p_session text, p_new boolean default false, p_course text default 'obj')
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_row public.sim_obj_attempts%rowtype; v_case public.sim_obj_cases%rowtype;
  v_roll float8; v_n int; v_keys text[] := '{}'; v_codes text[] := '{}'; v_errors jsonb := '[]'::jsonb; c record; v_ticket uuid;
  v_course text := coalesce(nullif(p_course, ''), 'obj');
begin
  if not sim_course_ok(v_course) then return json_build_object('ok', false, 'error', '課程不正確'); end if;
  v_uid := sim_obj_session_user(p_session);
  if v_uid is null then return json_build_object('ok', false, 'error', '模擬系統連結已過期，請從工具箱重新進入'); end if;
  if not sim_obj_can_use(v_uid) then return json_build_object('ok', false, 'error', '模擬系統僅開放行政管理部同仁使用'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;

  if coalesce(p_new, false) then
    update public.sim_obj_attempts set status = 'abandoned' where user_id = v_uid and course = v_course and status = 'in_progress';
  else
    select * into v_row from public.sim_obj_attempts
    where user_id = v_uid and course = v_course and status = 'in_progress' and case_id is not null
    order by started_at desc, id desc limit 1;
  end if;

  if v_row.id is not null then
    select * into v_case from public.sim_obj_cases where id = v_row.case_id;
  else
    select k.* into v_case from public.sim_obj_cases k
    where k.enabled and k.course = v_course
    order by (select count(*) from public.sim_obj_attempts a where a.user_id = v_uid and a.case_id = k.id and a.status = 'submitted'), random()
    limit 1;
    if v_case.id is null then return json_build_object('ok', false, 'error', '這門實作還沒有題目，請洽主管'); end if;

    v_roll := random();
    v_n := case when v_roll < 0.2 then 0 else 3 + floor(random() * 3)::int end;
    for c in select * from public.sim_obj_candidates where case_id = v_case.id order by random() loop
      exit when jsonb_array_length(v_errors) >= v_n;
      if c.keys && v_keys then continue; end if;
      -- 缺身分證反面（L9）時，戶籍地址（L4）、父母姓名（L5）無從核對，不同時出
      if (c.code = 'L9' and v_codes && array['L4', 'L5']) or (c.code in ('L4', 'L5') and 'L9' = any(v_codes)) then continue; end if;
      -- 房客：缺身分證反面（T9）時戶籍地址、父母姓名（T5、T6、T7）無從核對；缺戶籍謄本（T10）時戶號、家庭成員（T11～T13）無從核對
      if (c.code = 'T9' and v_codes && array['T5', 'T6', 'T7']) or (c.code in ('T5', 'T6', 'T7') and 'T9' = any(v_codes)) then continue; end if;
      if (c.code = 'T10' and v_codes && array['T11', 'T12', 'T13']) or (c.code in ('T11', 'T12', 'T13') and 'T10' = any(v_codes)) then continue; end if;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', c.code, 'page', c.page, 'label', c.label,
        'video', c.video, 'keys', to_jsonb(c.keys), 'explain', c.explain, 'patch', c.patch));
      v_keys := v_keys || c.keys;
      v_codes := v_codes || c.code;
    end loop;
    if jsonb_array_length(v_errors) < 3 then v_errors := '[]'::jsonb; end if;

    update public.sim_obj_attempts set status = 'abandoned' where user_id = v_uid and course = v_course and status = 'in_progress';
    insert into public.sim_obj_attempts (user_id, user_name, case_id, case_title, errors, course)
    values (v_uid, coalesce(nullif(v_acc.name, ''), v_acc.username), v_case.id, v_case.title, v_errors, v_course)
    returning * into v_row;
  end if;

  delete from public.course_video_tickets where expires_at < now() - interval '1 day';
  insert into public.course_video_tickets (user_id, course, expires_at)
  values (v_uid, 'sim', now() + interval '6 hours') returning ticket into v_ticket;

  return json_build_object('ok', true, 'course', v_course, 'attemptId', v_row.id, 'caseNo', v_case.id,
    'trainee', coalesce(nullif(v_acc.name, ''), v_acc.username),
    'data', sim_obj_apply(v_case.data, v_row.errors), 'files', v_case.files, 'ticket', v_ticket, 'flags', '[]'::json);
end; $$;

drop function if exists public.sim_obj_progress(text);
create or replace function public.sim_obj_progress(p_token text, p_course text default 'obj')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_passes int; v_course text := coalesce(nullif(p_course, ''), 'obj');
begin
  if not sim_course_ok(v_course) then return json_build_object('ok', false, 'error', '課程不正確'); end if;
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select count(*) into v_passes from public.sim_obj_attempts where user_id = v_uid and course = v_course and status = 'submitted' and passed;
  return json_build_object('ok', true, 'course', v_course, 'target', sim_obj_pass_target(), 'passes', v_passes,
    'done', v_passes >= sim_obj_pass_target(),
    'canUse', sim_obj_can_use(v_uid),
    'cases', (select count(*) from public.sim_obj_cases where enabled and course = v_course),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select id, score, passed, submitted_at as "submittedAt", duration_sec as "durationSec"
      from public.sim_obj_attempts where user_id = v_uid and course = v_course and status = 'submitted'
      order by submitted_at desc, id desc limit 30
    ) x), '[]'::json));
end; $$;

drop function if exists public.sim_obj_overview(text);
create or replace function public.sim_obj_overview(p_token text, p_course text default 'obj')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_course text := coalesce(nullif(p_course, ''), 'obj');
begin
  if not sim_course_ok(v_course) then return json_build_object('ok', false, 'error', '課程不正確'); end if;
  if admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  return json_build_object('ok', true, 'course', v_course, 'target', sim_obj_pass_target(),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select coalesce(nullif(acc.name, ''), acc.username) as name,
        count(*) filter (where a.passed) as passes,
        count(*) as attempts,
        max(a.score) as best,
        max(a.submitted_at) as "lastAt"
      from public.sim_obj_attempts a
      join public.toolbox_accounts acc on acc.id = a.user_id
      where a.status = 'submitted' and a.course = v_course
      group by acc.id, acc.name, acc.username
    ) x), '[]'::json));
end; $$;

drop function if exists public.sim_obj_admin_save_case(text, bigint, text, jsonb, jsonb, jsonb);
create or replace function public.sim_obj_admin_save_case(p_secret text, p_source_id bigint, p_title text, p_data jsonb, p_files jsonb, p_candidates jsonb, p_course text default 'obj')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_id bigint; c jsonb; v_course text := coalesce(nullif(p_course, ''), 'obj');
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  if not sim_course_ok(v_course) then return json_build_object('ok', false, 'error', '課程不正確'); end if;
  if p_source_id is null or jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> sim_course_root(v_course)) <> 'object' then
    return json_build_object('ok', false, 'error', '題目資料不完整');
  end if;
  insert into public.sim_obj_cases as k (course, source_id, title, data, files)
  values (v_course, p_source_id, left(coalesce(p_title, ''), 120), p_data, coalesce(p_files, '{}'::jsonb))
  on conflict (course, source_id) do update set title = excluded.title, data = excluded.data, files = excluded.files, updated_at = now()
  returning k.id into v_id;
  delete from public.sim_obj_candidates where case_id = v_id;
  for c in select value from jsonb_array_elements(case when jsonb_typeof(p_candidates) = 'array' then p_candidates else '[]'::jsonb end) loop
    continue when coalesce(c ->> 'code', '') = '' or jsonb_typeof(c -> 'keys') <> 'array' or jsonb_typeof(c -> 'patch') <> 'array';
    insert into public.sim_obj_candidates (case_id, code, page, label, video, keys, explain, patch)
    values (v_id, c ->> 'code', coalesce(c ->> 'page', ''), coalesce(c ->> 'label', ''), coalesce(c ->> 'video', ''),
      array(select jsonb_array_elements_text(c -> 'keys')), coalesce(c ->> 'explain', ''), c -> 'patch')
    on conflict (case_id, code) do nothing;
  end loop;
  return json_build_object('ok', true, 'id', v_id,
    'candidates', (select count(*) from public.sim_obj_candidates where case_id = v_id));
end; $$;

drop function if exists public.sim_obj_admin_list(text, int);
create or replace function public.sim_obj_admin_list(p_secret text, p_limit int default 1000, p_course text default 'obj')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_course text := coalesce(nullif(p_course, ''), 'obj');
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  if not sim_course_ok(v_course) then return json_build_object('ok', false, 'error', '課程不正確'); end if;
  return json_build_object('ok', true, 'course', v_course, 'target', sim_obj_pass_target(),
    'cases', coalesce((select json_agg(row_to_json(x)) from (
      select k.id, k.source_id as "sourceId", k.title, k.enabled, k.created_at as "createdAt", k.updated_at as "updatedAt",
        (select count(*) from public.sim_obj_candidates c where c.case_id = k.id) as candidates,
        (select coalesce(json_agg(c.code order by c.code), '[]'::json) from public.sim_obj_candidates c where c.case_id = k.id) as codes,
        (select count(*) from public.sim_obj_attempts a where a.case_id = k.id and a.status = 'submitted') as attempts,
        sim_obj_key_count(k.files) as files
      from public.sim_obj_cases k where k.course = v_course order by k.id desc
    ) x), '[]'::json),
    'items', coalesce((select json_agg(row_to_json(i)) from (
      select a.id, a.user_name as name, acc.team, a.case_id as "caseId", a.case_title as "caseTitle", a.status,
        a.started_at as "startedAt", a.submitted_at as "submittedAt", a.duration_sec as "durationSec",
        a.decision, a.reason, a.score, a.passed, a.result
      from public.sim_obj_attempts a
      left join public.toolbox_accounts acc on acc.id = a.user_id
      where a.status = 'submitted' and a.course = v_course
      order by a.submitted_at desc, a.id desc limit greatest(1, least(coalesce(p_limit, 1000), 5000))
    ) i), '[]'::json));
end; $$;

revoke all on function public.sim_course_ok(text) from public, anon, authenticated;
revoke all on function public.sim_course_root(text) from public, anon, authenticated;
grant execute on function public.sim_obj_start(text, boolean, text) to anon, authenticated;
grant execute on function public.sim_obj_progress(text, text) to anon, authenticated;
grant execute on function public.sim_obj_overview(text, text) to anon, authenticated;
grant execute on function public.sim_obj_admin_save_case(text, bigint, text, jsonb, jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.sim_obj_admin_list(text, int, text) to anon, authenticated;
