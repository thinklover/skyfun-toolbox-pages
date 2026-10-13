-- 行政點數表 › 教育訓練 › 實作：物審模擬系統
-- 題目來源是公司系統已核准的物件（後台「從公司系統抓題目」存進 sim_obj_cases），出題時依候選錯誤隨機埋 0～3 個錯，
-- 學員在模擬系統裡標錯並放行／退回，由 sim_obj_submit 在伺服器端評分。候選錯誤（＝答案）只存在資料庫，前端拿不到。
-- 附件放在 R2 私有空間，由 skyfun-training-video Worker 的 /s/ 路徑讀取，觀看票共用 course_video_tickets（course = 'sim'）。
-- 需先套用 admin-qa.sql（admin_qa_user_id、admin_qa_can_participate）、course-video.sql（course_video_tickets）。

create table if not exists public.sim_obj_cases (
  id bigint generated always as identity primary key,
  source_id bigint not null unique,
  title text not null default '',
  data jsonb not null,
  files jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sim_obj_cases enable row level security;
revoke all on public.sim_obj_cases from anon, authenticated;

create table if not exists public.sim_obj_candidates (
  case_id bigint not null references public.sim_obj_cases(id) on delete cascade,
  code text not null,
  page text not null default '',
  label text not null default '',
  video text not null default '',
  keys text[] not null,
  explain text not null default '',
  patch jsonb not null,
  primary key (case_id, code)
);
alter table public.sim_obj_candidates enable row level security;
revoke all on public.sim_obj_candidates from anon, authenticated;

create table if not exists public.sim_obj_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  user_name text not null default '',
  case_id bigint references public.sim_obj_cases(id) on delete set null,
  case_title text not null default '',
  errors jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'abandoned')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_sec int,
  decision int,
  reason text,
  flags text[],
  score int,
  passed boolean not null default false,
  result jsonb
);
create index if not exists sim_obj_attempts_user_idx on public.sim_obj_attempts (user_id, started_at desc);
alter table public.sim_obj_attempts enable row level security;
revoke all on public.sim_obj_attempts from anon, authenticated;

-- 模擬系統是另一個網站，不把工具箱登入 token 帶過去：工具箱先換一張 12 小時有效的模擬系統通行證
create table if not exists public.sim_obj_sessions (
  session uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sim_obj_sessions_exp_idx on public.sim_obj_sessions (expires_at);
alter table public.sim_obj_sessions enable row level security;
revoke all on public.sim_obj_sessions from anon, authenticated;

-- 可以用模擬系統：行政管理部同仁，加上測試教育訓練用的主管（同 admin-points-core.js TRAINING_TESTERS）
create or replace function public.sim_obj_can_use(p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select admin_qa_can_participate(p_user_id)
    or exists (select 1 from public.toolbox_accounts where id = p_user_id and name = any (array['簡為倢', '邱奕棋']));
$$;
revoke all on function public.sim_obj_can_use(uuid) from public, anon, authenticated;

create or replace function public.sim_obj_session(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_session uuid;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  if not sim_obj_can_use(v_uid) then return json_build_object('ok', false, 'error', '模擬系統僅開放行政管理部同仁使用'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;
  delete from public.sim_obj_sessions where expires_at < now() - interval '1 day';
  insert into public.sim_obj_sessions (user_id, expires_at) values (v_uid, now() + interval '12 hours') returning session into v_session;
  return json_build_object('ok', true, 'session', v_session, 'name', coalesce(nullif(v_acc.name, ''), v_acc.username));
end; $$;

create or replace function public.sim_obj_session_user(p_session text)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  if coalesce(p_session, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  select user_id into v_uid from public.sim_obj_sessions where session = p_session::uuid and expires_at > now();
  return v_uid;
end; $$;

-- 實作要通過幾題才算完成
create or replace function public.sim_obj_pass_target()
returns int language sql immutable as $$ select 3 $$;

-- 把埋錯（patch：{t, p[], v}）套到題目資料上；安全檢核在物件資料裡還有一份副本，要跟著同步（同 sim-obj-rules.js applyPatches）
create or replace function public.sim_obj_apply(p_data jsonb, p_errors jsonb)
returns jsonb language plpgsql immutable set search_path to 'public' as $$
declare
  d jsonb := p_data; e jsonb; x jsonb; v_path text[]; v_parent jsonb;
begin
  for e in select value from jsonb_array_elements(coalesce(p_errors, '[]'::jsonb)) loop
    for x in select value from jsonb_array_elements(coalesce(e -> 'patch', '[]'::jsonb)) loop
      v_path := array[x ->> 't'] || array(select t from jsonb_array_elements_text(coalesce(x -> 'p', '[]'::jsonb)) with ordinality as a(t, n) order by n);
      if cardinality(v_path) < 2 then continue; end if;
      v_parent := d #> v_path[1:cardinality(v_path) - 1];
      if v_parent is null or jsonb_typeof(v_parent) not in ('object', 'array') then continue; end if;
      d := jsonb_set(d, v_path, coalesce(x -> 'v', 'null'::jsonb), true);
    end loop;
  end loop;
  if jsonb_typeof(d #> '{obj,safetyCheck}') = 'object' and jsonb_typeof(d -> 'safety') = 'object' then
    d := jsonb_set(d, '{obj,safetyCheck}', d -> 'safety');
  end if;
  return d;
end; $$;

-- 開始作答：有進行中的題目就續作（p_new 為 true 時放棄它改出新題）；否則挑一個學員最少做過的案件，隨機埋 0～3 個錯
create or replace function public.sim_obj_start(p_session text, p_new boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_row public.sim_obj_attempts%rowtype; v_case public.sim_obj_cases%rowtype;
  v_roll float8; v_n int; v_keys text[] := '{}'; v_errors jsonb := '[]'::jsonb; c record; v_ticket uuid;
begin
  v_uid := sim_obj_session_user(p_session);
  if v_uid is null then return json_build_object('ok', false, 'error', '模擬系統連結已過期，請從工具箱重新進入'); end if;
  if not sim_obj_can_use(v_uid) then return json_build_object('ok', false, 'error', '模擬系統僅開放行政管理部同仁使用'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;

  if coalesce(p_new, false) then
    update public.sim_obj_attempts set status = 'abandoned' where user_id = v_uid and status = 'in_progress';
  else
    select * into v_row from public.sim_obj_attempts
    where user_id = v_uid and status = 'in_progress' and case_id is not null
    order by started_at desc, id desc limit 1;
  end if;

  if v_row.id is not null then
    select * into v_case from public.sim_obj_cases where id = v_row.case_id;
  else
    select k.* into v_case from public.sim_obj_cases k
    where k.enabled
    order by (select count(*) from public.sim_obj_attempts a where a.user_id = v_uid and a.case_id = k.id and a.status = 'submitted'), random()
    limit 1;
    if v_case.id is null then return json_build_object('ok', false, 'error', '模擬系統還沒有題目，請洽主管'); end if;

    v_roll := random();
    v_n := case when v_roll < 0.2 then 0 when v_roll < 0.5 then 1 when v_roll < 0.8 then 2 else 3 end;
    for c in select * from public.sim_obj_candidates where case_id = v_case.id order by random() loop
      exit when jsonb_array_length(v_errors) >= v_n;
      if c.keys && v_keys then continue; end if;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', c.code, 'page', c.page, 'label', c.label,
        'video', c.video, 'keys', to_jsonb(c.keys), 'explain', c.explain, 'patch', c.patch));
      v_keys := v_keys || c.keys;
    end loop;

    update public.sim_obj_attempts set status = 'abandoned' where user_id = v_uid and status = 'in_progress';
    insert into public.sim_obj_attempts (user_id, user_name, case_id, case_title, errors)
    values (v_uid, coalesce(nullif(v_acc.name, ''), v_acc.username), v_case.id, v_case.title, v_errors)
    returning * into v_row;
  end if;

  delete from public.course_video_tickets where expires_at < now() - interval '1 day';
  insert into public.course_video_tickets (user_id, course, expires_at)
  values (v_uid, 'sim', now() + interval '6 hours') returning ticket into v_ticket;

  return json_build_object('ok', true, 'attemptId', v_row.id, 'caseNo', v_case.id,
    'trainee', coalesce(nullif(v_acc.name, ''), v_acc.username),
    'data', sim_obj_apply(v_case.data, v_row.errors), 'files', v_case.files, 'ticket', v_ticket, 'flags', '[]'::json);
end; $$;

-- 交卷評分（同 sim-obj-rules.js grade）：判斷正確 40 分；找錯 60 分依題數平分（沒有錯的案件判斷正確就給滿）；每個誤標扣 5 分。
-- 通過：判斷正確、全部找到、誤標不超過 1 處。交卷後才回傳正確答案與說明。
create or replace function public.sim_obj_submit(p_session text, p_attempt_id bigint, p_decision int, p_flags jsonb, p_reason text default '')
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_row public.sim_obj_attempts%rowtype; v_flags text[]; v_all text[]; v_false text[];
  v_n int; v_found int := 0; v_expected int; v_dec_ok boolean; v_find int; v_score int; v_passed boolean;
  v_list jsonb := '[]'::jsonb; e jsonb; v_hit boolean; v_result jsonb;
begin
  v_uid := sim_obj_session_user(p_session);
  if v_uid is null then return json_build_object('ok', false, 'error', '模擬系統連結已過期，請從工具箱重新進入（這一題的標記都還在）'); end if;
  if p_decision not in (1, 2) then return json_build_object('ok', false, 'error', '請選擇核准或退回'); end if;
  select * into v_row from public.sim_obj_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'error', '找不到這一題'); end if;
  if v_row.status <> 'in_progress' then return json_build_object('ok', false, 'error', '這一題已交卷或已放棄'); end if;

  select coalesce(array_agg(distinct f), '{}') into v_flags
  from (select left(f, 200) f from jsonb_array_elements_text(case when jsonb_typeof(p_flags) = 'array' then p_flags else '[]'::jsonb end) f limit 200) x;

  v_n := jsonb_array_length(v_row.errors);
  for e in select value from jsonb_array_elements(v_row.errors) loop
    v_hit := exists (select 1 from jsonb_array_elements_text(e -> 'keys') k where k = any(v_flags));
    if v_hit then v_found := v_found + 1; end if;
    v_list := v_list || jsonb_build_array((e - 'patch') || jsonb_build_object('found', v_hit));
  end loop;
  select coalesce(array_agg(k), '{}') into v_all from (select jsonb_array_elements_text(e2 -> 'keys') k from jsonb_array_elements(v_row.errors) e2) x;
  select coalesce(array_agg(f order by f), '{}') into v_false from unnest(v_flags) f where not (f = any(v_all));

  v_expected := case when v_n > 0 then 2 else 1 end;
  v_dec_ok := p_decision = v_expected;
  v_find := case when v_n > 0 then round(60.0 * v_found / v_n)::int when v_dec_ok then 60 else 0 end;
  v_score := greatest(0, (case when v_dec_ok then 40 else 0 end) + v_find - 5 * cardinality(v_false));
  v_passed := v_dec_ok and v_found = v_n and cardinality(v_false) <= 1;
  v_result := jsonb_build_object('score', v_score, 'passed', v_passed, 'decisionOk', v_dec_ok, 'expected', v_expected,
    'decision', p_decision, 'errors', v_list, 'falseFlags', to_jsonb(v_false));

  update public.sim_obj_attempts set
    status = 'submitted', submitted_at = now(),
    duration_sec = greatest(0, extract(epoch from (now() - started_at))::int),
    decision = p_decision, reason = left(coalesce(p_reason, ''), 2000), flags = v_flags,
    score = v_score, passed = v_passed, result = v_result
  where id = v_row.id;

  return (jsonb_build_object('ok', true) || v_result)::json;
end; $$;

-- 學員：自己的實作進度
create or replace function public.sim_obj_progress(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_passes int;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select count(*) into v_passes from public.sim_obj_attempts where user_id = v_uid and status = 'submitted' and passed;
  return json_build_object('ok', true, 'target', sim_obj_pass_target(), 'passes', v_passes,
    'done', v_passes >= sim_obj_pass_target(),
    'canUse', sim_obj_can_use(v_uid),
    'cases', (select count(*) from public.sim_obj_cases where enabled),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select id, score, passed, submitted_at as "submittedAt", duration_sec as "durationSec"
      from public.sim_obj_attempts where user_id = v_uid and status = 'submitted'
      order by submitted_at desc, id desc limit 30
    ) x), '[]'::json));
end; $$;

-- 點數表：所有人的實作通過題數（依帳號姓名；不含作答內容）
create or replace function public.sim_obj_overview(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  return json_build_object('ok', true, 'target', sim_obj_pass_target(),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select coalesce(nullif(acc.name, ''), acc.username) as name,
        count(*) filter (where a.passed) as passes,
        count(*) as attempts,
        max(a.score) as best,
        max(a.submitted_at) as "lastAt"
      from public.sim_obj_attempts a
      join public.toolbox_accounts acc on acc.id = a.user_id
      where a.status = 'submitted'
      group by acc.id, acc.name, acc.username
    ) x), '[]'::json));
end; $$;

-- 後台：Worker 上傳附件前驗證後台密碼
create or replace function public.sim_obj_admin_check(p_secret text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select toolbox_check_admin(p_secret);
$$;

-- 後台：新增／更新題目案件（同一個公司物件 id 重抓會覆蓋資料與候選錯誤）
create or replace function public.sim_obj_admin_save_case(p_secret text, p_source_id bigint, p_title text, p_data jsonb, p_files jsonb, p_candidates jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_id bigint; c jsonb;
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  if p_source_id is null or jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'obj') <> 'object' then
    return json_build_object('ok', false, 'error', '題目資料不完整');
  end if;
  insert into public.sim_obj_cases as k (source_id, title, data, files)
  values (p_source_id, left(coalesce(p_title, ''), 120), p_data, coalesce(p_files, '{}'::jsonb))
  on conflict (source_id) do update set title = excluded.title, data = excluded.data, files = excluded.files, updated_at = now()
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

create or replace function public.sim_obj_admin_set_case(p_secret text, p_case_id bigint, p_enabled boolean, p_delete boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  if coalesce(p_delete, false) then
    delete from public.sim_obj_cases where id = p_case_id;
  else
    update public.sim_obj_cases set enabled = coalesce(p_enabled, enabled), updated_at = now() where id = p_case_id;
  end if;
  return json_build_object('ok', true);
end; $$;

create or replace function public.sim_obj_key_count(p jsonb)
returns int language sql immutable as $$
  select case when jsonb_typeof(p) = 'object' then (select count(*) from jsonb_object_keys(p))::int else 0 end;
$$;

-- 後台：題目清單＋所有人的作答紀錄（含標錯、判斷與每個錯有沒有找到）
create or replace function public.sim_obj_admin_list(p_secret text, p_limit int default 1000)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true, 'target', sim_obj_pass_target(),
    'cases', coalesce((select json_agg(row_to_json(x)) from (
      select k.id, k.source_id as "sourceId", k.title, k.enabled, k.created_at as "createdAt", k.updated_at as "updatedAt",
        (select count(*) from public.sim_obj_candidates c where c.case_id = k.id) as candidates,
        (select coalesce(json_agg(c.code order by c.code), '[]'::json) from public.sim_obj_candidates c where c.case_id = k.id) as codes,
        (select count(*) from public.sim_obj_attempts a where a.case_id = k.id and a.status = 'submitted') as attempts,
        sim_obj_key_count(k.files) as files
      from public.sim_obj_cases k order by k.id desc
    ) x), '[]'::json),
    'items', coalesce((select json_agg(row_to_json(i)) from (
      select a.id, a.user_name as name, acc.team, a.case_id as "caseId", a.case_title as "caseTitle", a.status,
        a.started_at as "startedAt", a.submitted_at as "submittedAt", a.duration_sec as "durationSec",
        a.decision, a.reason, a.score, a.passed, a.result
      from public.sim_obj_attempts a
      left join public.toolbox_accounts acc on acc.id = a.user_id
      where a.status = 'submitted'
      order by a.submitted_at desc, a.id desc limit greatest(1, least(coalesce(p_limit, 1000), 5000))
    ) i), '[]'::json));
end; $$;

revoke all on function public.sim_obj_apply(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.sim_obj_key_count(jsonb) from public, anon, authenticated;
revoke all on function public.sim_obj_session_user(text) from public, anon, authenticated;
grant execute on function public.sim_obj_session(text) to anon, authenticated;
grant execute on function public.sim_obj_start(text, boolean) to anon, authenticated;
grant execute on function public.sim_obj_submit(text, bigint, int, jsonb, text) to anon, authenticated;
grant execute on function public.sim_obj_progress(text) to anon, authenticated;
grant execute on function public.sim_obj_overview(text) to anon, authenticated;
grant execute on function public.sim_obj_admin_check(text) to anon, authenticated;
grant execute on function public.sim_obj_admin_save_case(text, bigint, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.sim_obj_admin_set_case(text, bigint, boolean, boolean) to anon, authenticated;
grant execute on function public.sim_obj_admin_list(text, int) to anon, authenticated;
