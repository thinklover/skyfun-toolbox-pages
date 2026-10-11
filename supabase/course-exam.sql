-- 行政點數表 › 教育訓練 › 課程影片線上考試（物審 obj、房客 tenant、預審 pre）
-- 每個課程一份 20 題、限時 20 分鐘；全部答對才算通過，沒全對就用同一份題目重考（選項順序重排）。
-- 答案只存在 course_exam_keys（由 包租代管題庫/course-exam-keys.sql 匯入），前端無法讀取；由 course_exam_submit 於伺服器端評分。

create table if not exists public.course_exam_keys (
  course text not null,
  qid text not null,
  answer text not null,
  primary key (course, qid)
);
alter table public.course_exam_keys enable row level security;
revoke all on public.course_exam_keys from anon, authenticated;

create table if not exists public.course_exam_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  username text not null default '',
  user_name text not null default '',
  course text not null,
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
create index if not exists course_exam_attempts_user_idx on public.course_exam_attempts (user_id, course, started_at desc);
alter table public.course_exam_attempts enable row level security;
revoke all on public.course_exam_attempts from anon, authenticated;

-- 開始考試：有未過期的進行中考卷就續考；已通過就不再出卷；否則出該課程全部題目
create or replace function public.course_exam_start(p_token text, p_course text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_row public.course_exam_attempts%rowtype;
  v_qids text[]; v_retake int;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;

  select * into v_row from public.course_exam_attempts
  where user_id = v_uid and course = p_course and status = 'in_progress' and deadline_at > now()
  order by started_at desc, id desc limit 1;
  if found then
    return json_build_object('ok', true, 'resumed', true, 'attemptId', v_row.id, 'qids', v_row.qids,
      'retake', v_row.retake, 'deadlineAt', v_row.deadline_at, 'serverNow', now());
  end if;

  if exists (select 1 from public.course_exam_attempts where user_id = v_uid and course = p_course and passed) then
    return json_build_object('ok', false, 'done', true, 'error', '這個課程的考試已經滿分通過');
  end if;

  select coalesce(array_agg(qid order by random()), '{}') into v_qids
  from public.course_exam_keys where course = p_course;
  if cardinality(v_qids) = 0 then
    return json_build_object('ok', false, 'error', '這個課程還沒有考試題目');
  end if;

  update public.course_exam_attempts set status = 'abandoned'
  where user_id = v_uid and course = p_course and status = 'in_progress';

  select count(*) into v_retake from public.course_exam_attempts
  where user_id = v_uid and course = p_course and status = 'submitted';

  insert into public.course_exam_attempts (user_id, username, user_name, course, retake, qids, deadline_at, total)
  values (v_uid, v_acc.username, coalesce(nullif(v_acc.name, ''), v_acc.username), p_course, v_retake, v_qids,
    now() + interval '20 minutes', cardinality(v_qids))
  returning * into v_row;

  return json_build_object('ok', true, 'resumed', false, 'attemptId', v_row.id, 'qids', v_row.qids,
    'retake', v_row.retake, 'deadlineAt', v_row.deadline_at, 'serverNow', now());
end; $$;

-- 交卷與評分（只回傳對錯，不回傳正確答案，重考才有意義）
create or replace function public.course_exam_submit(p_token text, p_attempt_id bigint, p_answers jsonb, p_auto boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_row public.course_exam_attempts%rowtype; v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_results jsonb := '{}'::jsonb; v_correct int := 0; q text; v_key text; v_ok boolean;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_row from public.course_exam_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'error', '找不到這份考卷'); end if;
  if v_row.status <> 'in_progress' then return json_build_object('ok', false, 'error', '這份考卷已交卷或已作廢'); end if;

  foreach q in array v_row.qids loop
    select answer into v_key from public.course_exam_keys where course = v_row.course and qid = q;
    v_ok := v_key is not null and (v_answers ->> q) = v_key;
    if v_ok then v_correct := v_correct + 1; end if;
    v_results := v_results || jsonb_build_object(q, v_ok);
  end loop;

  update public.course_exam_attempts set
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

  return json_build_object('ok', true, 'attemptId', v_row.id, 'course', v_row.course, 'retake', v_row.retake,
    'correct', v_row.correct, 'total', v_row.total, 'passed', v_row.passed, 'results', v_row.results,
    'durationSec', v_row.duration_sec, 'overtime', v_row.overtime, 'autoSubmitted', v_row.auto_submitted);
end; $$;

-- 考生：自己在某課程的狀態與考試紀錄
create or replace function public.course_exam_progress(p_token text, p_course text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  return json_build_object('ok', true,
    'total', (select count(*) from public.course_exam_keys where course = p_course),
    'passed', exists (select 1 from public.course_exam_attempts where user_id = v_uid and course = p_course and passed),
    'best', (select max(correct) from public.course_exam_attempts where user_id = v_uid and course = p_course and status = 'submitted'),
    'inProgress', exists (select 1 from public.course_exam_attempts where user_id = v_uid and course = p_course and status = 'in_progress' and deadline_at > now()),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select id, retake, status, correct, total, passed, started_at as "startedAt",
        duration_sec as "durationSec", auto_submitted as "autoSubmitted", overtime
      from public.course_exam_attempts where user_id = v_uid and course = p_course and status <> 'in_progress'
      order by started_at desc, id desc limit 30
    ) x), '[]'::json));
end; $$;

-- 點數表：所有人各課程的考試狀態（依帳號姓名；不含作答與答案）
create or replace function public.course_exam_overview(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  return json_build_object('ok', true,
    'totals', coalesce((select json_object_agg(course, n) from (
      select course, count(*) as n from public.course_exam_keys group by course) t), '{}'::json),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select coalesce(nullif(acc.name, ''), acc.username) as name, a.course,
        bool_or(a.passed) as passed,
        count(*) filter (where a.status = 'submitted') as attempts,
        max(a.correct) filter (where a.status = 'submitted') as best,
        max(a.total) as total,
        max(a.submitted_at) as "lastAt",
        min(a.submitted_at) filter (where a.passed) as "passedAt"
      from public.course_exam_attempts a
      join public.toolbox_accounts acc on acc.id = a.user_id
      where a.status <> 'in_progress'
      group by acc.id, acc.name, acc.username, a.course
    ) x), '[]'::json));
end; $$;

grant execute on function public.course_exam_start(text, text) to anon, authenticated;
grant execute on function public.course_exam_submit(text, bigint, jsonb, boolean) to anon, authenticated;
grant execute on function public.course_exam_progress(text, text) to anon, authenticated;
grant execute on function public.course_exam_overview(text) to anon, authenticated;
