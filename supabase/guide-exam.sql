-- 行政點數表 › 教育訓練 › 執行要點線上考試
-- 每次 20 題、限時 20 分鐘；全對才算通過，沒全對要用同一份題目補考，通過後才抽下一份。
-- 答案只存在 guide_exam_keys（由 包租代管題庫/guide-exam-keys.sql 匯入），前端無法讀取；由 guide_exam_submit 於伺服器端評分。

create table if not exists public.guide_exam_keys (
  qid text primary key,
  answer text not null
);
alter table public.guide_exam_keys enable row level security;
revoke all on public.guide_exam_keys from anon, authenticated;

create table if not exists public.guide_exam_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  username text not null default '',
  user_name text not null default '',
  set_no int not null,
  retake int not null default 0,
  qids text[] not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'abandoned')),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  duration_sec int,
  auto_submitted boolean not null default false,
  overtime boolean not null default false,
  correct int,
  total int not null,
  passed boolean not null default false,
  answers jsonb,
  results jsonb
);
create index if not exists guide_exam_attempts_user_idx on public.guide_exam_attempts (user_id, started_at desc);
alter table public.guide_exam_attempts enable row level security;
revoke all on public.guide_exam_attempts from anon, authenticated;

create or replace function public.guide_exam_passed_qids(p_uid uuid)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(distinct q), '{}')
  from public.guide_exam_attempts a, unnest(a.qids) q
  where a.user_id = p_uid and a.passed;
$$;

-- 開始考試：有未過期的進行中考卷就續考；上一份沒全對就用同一份補考；否則從還沒通過的題目抽 20 題
create or replace function public.guide_exam_start(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_row public.guide_exam_attempts%rowtype;
  v_last public.guide_exam_attempts%rowtype; v_qids text[]; v_set int; v_retake int := 0;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;

  select * into v_row from public.guide_exam_attempts
  where user_id = v_uid and status = 'in_progress' and deadline_at > now()
  order by started_at desc, id desc limit 1;
  if found then
    return json_build_object('ok', true, 'resumed', true, 'attemptId', v_row.id, 'qids', v_row.qids,
      'setNo', v_row.set_no, 'retake', v_row.retake, 'deadlineAt', v_row.deadline_at, 'serverNow', now());
  end if;

  update public.guide_exam_attempts set status = 'abandoned'
  where user_id = v_uid and status = 'in_progress';

  select * into v_last from public.guide_exam_attempts
  where user_id = v_uid order by started_at desc, id desc limit 1;
  if found and not v_last.passed then
    v_qids := v_last.qids;
    v_set := v_last.set_no;
    v_retake := v_last.retake + 1;
  else
    select coalesce(array_agg(qid), '{}') into v_qids from (
      select qid from public.guide_exam_keys
      where qid <> all (guide_exam_passed_qids(v_uid))
      order by random() limit 20
    ) s;
    if cardinality(v_qids) = 0 then
      return json_build_object('ok', false, 'done', true, 'error', '執行要點題目已全部考過滿分');
    end if;
    select coalesce(max(set_no), 0) + 1 into v_set from public.guide_exam_attempts where user_id = v_uid and passed;
  end if;

  insert into public.guide_exam_attempts (user_id, username, user_name, set_no, retake, qids, deadline_at, total)
  values (v_uid, v_acc.username, coalesce(nullif(v_acc.name, ''), v_acc.username), v_set, v_retake, v_qids,
    now() + interval '20 minutes', cardinality(v_qids))
  returning * into v_row;

  return json_build_object('ok', true, 'resumed', false, 'attemptId', v_row.id, 'qids', v_row.qids,
    'setNo', v_row.set_no, 'retake', v_row.retake, 'deadlineAt', v_row.deadline_at, 'serverNow', now());
end; $$;

-- 交卷與評分（沒全對時只回傳對錯，不回傳正確答案，補考才有意義）
create or replace function public.guide_exam_submit(p_token text, p_attempt_id bigint, p_answers jsonb, p_auto boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_row public.guide_exam_attempts%rowtype; v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_results jsonb := '{}'::jsonb; v_correct int := 0; q text; v_key text; v_ok boolean;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_row from public.guide_exam_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'error', '找不到這份考卷'); end if;
  if v_row.status <> 'in_progress' then return json_build_object('ok', false, 'error', '這份考卷已交卷或已作廢'); end if;

  foreach q in array v_row.qids loop
    select answer into v_key from public.guide_exam_keys where qid = q;
    v_ok := v_key is not null and (v_answers ->> q) = v_key;
    if v_ok then v_correct := v_correct + 1; end if;
    v_results := v_results || jsonb_build_object(q, v_ok);
  end loop;

  update public.guide_exam_attempts set
    status = 'submitted',
    submitted_at = now(),
    duration_sec = greatest(0, extract(epoch from (now() - started_at))::int),
    auto_submitted = coalesce(p_auto, false),
    overtime = now() > deadline_at + interval '90 seconds',
    correct = v_correct,
    passed = v_correct = v_row.total,
    answers = v_answers,
    results = v_results
  where id = v_row.id
  returning * into v_row;

  return json_build_object('ok', true, 'attemptId', v_row.id, 'setNo', v_row.set_no, 'retake', v_row.retake,
    'correct', v_row.correct, 'total', v_row.total, 'passed', v_row.passed, 'results', v_row.results,
    'durationSec', v_row.duration_sec, 'overtime', v_row.overtime, 'autoSubmitted', v_row.auto_submitted,
    'progress', json_build_object('passed', cardinality(guide_exam_passed_qids(v_uid)),
      'total', (select count(*) from public.guide_exam_keys)));
end; $$;

-- 考生：自己的進度與考試紀錄
create or replace function public.guide_exam_progress(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_last public.guide_exam_attempts%rowtype; v_pending json;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_last from public.guide_exam_attempts
  where user_id = v_uid and status <> 'in_progress' order by started_at desc, id desc limit 1;
  if found and not v_last.passed then
    v_pending := json_build_object('setNo', v_last.set_no, 'retake', v_last.retake + 1, 'total', v_last.total);
  end if;
  return json_build_object('ok', true,
    'passed', cardinality(guide_exam_passed_qids(v_uid)),
    'total', (select count(*) from public.guide_exam_keys),
    'pending', v_pending,
    'inProgress', exists (select 1 from public.guide_exam_attempts where user_id = v_uid and status = 'in_progress' and deadline_at > now()),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select id, set_no as "setNo", retake, status, correct, total, passed, started_at as "startedAt",
        duration_sec as "durationSec", auto_submitted as "autoSubmitted", overtime
      from public.guide_exam_attempts where user_id = v_uid and status <> 'in_progress'
      order by started_at desc, id desc limit 30
    ) x), '[]'::json));
end; $$;

-- 點數表：所有人的考試進度與成績（依帳號姓名；不含作答與答案，處長、組長可追蹤）
create or replace function public.guide_exam_overview(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  return json_build_object('ok', true,
    'total', (select count(*) from public.guide_exam_keys),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select coalesce(nullif(acc.name, ''), acc.username) as name,
        cardinality(guide_exam_passed_qids(acc.id)) as passed,
        (select count(*) from public.guide_exam_attempts a where a.user_id = acc.id and a.status = 'submitted') as attempts,
        (select count(*) from public.guide_exam_attempts a where a.user_id = acc.id and a.passed) as "passedSets",
        (select max(a.submitted_at) from public.guide_exam_attempts a where a.user_id = acc.id) as "lastAt",
        (select not l.passed from public.guide_exam_attempts l
          where l.user_id = acc.id and l.status <> 'in_progress' order by l.started_at desc, l.id desc limit 1) as "pendingRetake",
        coalesce((select json_agg(row_to_json(h)) from (
          select a.set_no as "setNo", a.retake, a.status, a.correct, a.total, a.passed,
            a.submitted_at as "submittedAt", a.duration_sec as "durationSec", a.auto_submitted as "autoSubmitted"
          from public.guide_exam_attempts a
          where a.user_id = acc.id and a.status <> 'in_progress'
          order by a.started_at desc, a.id desc limit 10
        ) h), '[]'::json) as history
      from public.toolbox_accounts acc
      where exists (select 1 from public.guide_exam_attempts a where a.user_id = acc.id)
    ) x), '[]'::json));
end; $$;

-- 管理員後台：每人進度＋全部考試紀錄（後台密碼）
create or replace function public.guide_exam_admin_list(p_secret text, p_query text default '', p_limit int default 1000)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_q text := trim(coalesce(p_query, ''));
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true,
    'total', (select count(*) from public.guide_exam_keys),
    'people', coalesce((select json_agg(row_to_json(p) order by p."passed" desc, p."userName") from (
      select acc.id as "userId", coalesce(nullif(acc.name, ''), acc.username) as "userName", acc.username, acc.team,
        cardinality(guide_exam_passed_qids(acc.id)) as "passed",
        (select count(*) from public.guide_exam_attempts a where a.user_id = acc.id and a.passed) as "passedSets",
        (select count(*) from public.guide_exam_attempts a where a.user_id = acc.id and a.status = 'submitted') as "attempts",
        (select max(a.submitted_at) from public.guide_exam_attempts a where a.user_id = acc.id) as "lastAt",
        (select not l.passed from public.guide_exam_attempts l
          where l.user_id = acc.id and l.status <> 'in_progress' order by l.started_at desc, l.id desc limit 1) as "pendingRetake"
      from public.toolbox_accounts acc
      where exists (select 1 from public.guide_exam_attempts a where a.user_id = acc.id)
        and (v_q = '' or acc.name ilike '%' || v_q || '%' or acc.username ilike '%' || v_q || '%' or acc.team ilike '%' || v_q || '%')
    ) p), '[]'::json),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select a.id, a.username, a.user_name as "userName", acc.team, a.set_no as "setNo", a.retake, a.status,
        a.correct, a.total, a.passed, a.started_at as "startedAt", a.submitted_at as "submittedAt",
        a.duration_sec as "durationSec", a.auto_submitted as "autoSubmitted", a.overtime
      from public.guide_exam_attempts a
      left join public.toolbox_accounts acc on acc.id = a.user_id
      where v_q = '' or a.user_name ilike '%' || v_q || '%' or a.username ilike '%' || v_q || '%' or acc.team ilike '%' || v_q || '%'
      order by a.started_at desc, a.id desc limit greatest(1, least(coalesce(p_limit, 1000), 2000))
    ) x), '[]'::json));
end; $$;

-- 管理員後台：單份考卷作答明細（含正確答案）
create or replace function public.guide_exam_admin_get(p_secret text, p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_row public.guide_exam_attempts%rowtype;
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  select * into v_row from public.guide_exam_attempts where id = p_id;
  if not found then return json_build_object('ok', false, 'error', '找不到紀錄'); end if;
  return json_build_object('ok', true, 'item', json_build_object(
    'id', v_row.id, 'userName', v_row.user_name, 'username', v_row.username,
    'team', (select team from public.toolbox_accounts where id = v_row.user_id),
    'setNo', v_row.set_no, 'retake', v_row.retake, 'status', v_row.status,
    'correct', v_row.correct, 'total', v_row.total, 'passed', v_row.passed,
    'qids', v_row.qids, 'answers', v_row.answers, 'results', v_row.results,
    'keys', (select coalesce(jsonb_object_agg(k.qid, k.answer), '{}'::jsonb) from public.guide_exam_keys k where k.qid = any (v_row.qids)),
    'startedAt', v_row.started_at, 'submittedAt', v_row.submitted_at, 'durationSec', v_row.duration_sec,
    'autoSubmitted', v_row.auto_submitted, 'overtime', v_row.overtime));
end; $$;

revoke all on function public.guide_exam_passed_qids(uuid) from public, anon, authenticated;
grant execute on function public.guide_exam_start(text) to anon, authenticated;
grant execute on function public.guide_exam_submit(text, bigint, jsonb, boolean) to anon, authenticated;
grant execute on function public.guide_exam_progress(text) to anon, authenticated;
grant execute on function public.guide_exam_overview(text) to anon, authenticated;
grant execute on function public.guide_exam_admin_list(text, text, int) to anon, authenticated;
grant execute on function public.guide_exam_admin_get(text, bigint) to anon, authenticated;
