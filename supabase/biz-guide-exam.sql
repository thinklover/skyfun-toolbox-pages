-- 業務專區 › 執行要點考試（題庫與行政同一份 guide_exam_keys）
-- 規則：每人只抽一組 20 題；沒滿分就同一組補考到全對；前台公開姓名＋成績。

create table if not exists public.biz_guide_exam_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  username text not null default '',
  user_name text not null default '',
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
create index if not exists biz_guide_exam_attempts_user_idx
  on public.biz_guide_exam_attempts (user_id, started_at desc);
alter table public.biz_guide_exam_attempts enable row level security;
revoke all on public.biz_guide_exam_attempts from anon, authenticated;

create or replace function public.biz_guide_exam_start(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_row public.biz_guide_exam_attempts%rowtype;
  v_last public.biz_guide_exam_attempts%rowtype; v_qids text[]; v_retake int := 0;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;

  /* 已滿分 → 不用再考 */
  if exists (
    select 1 from public.biz_guide_exam_attempts
    where user_id = v_uid and passed
  ) then
    return json_build_object('ok', false, 'done', true, 'error', '你已考過滿分，不用再考');
  end if;

  select * into v_row from public.biz_guide_exam_attempts
  where user_id = v_uid and status = 'in_progress' and deadline_at > now()
  order by started_at desc, id desc limit 1;
  if found then
    return json_build_object('ok', true, 'resumed', true, 'attemptId', v_row.id, 'qids', v_row.qids,
      'retake', v_row.retake, 'deadlineAt', v_row.deadline_at, 'serverNow', now());
  end if;

  update public.biz_guide_exam_attempts set status = 'abandoned'
  where user_id = v_uid and status = 'in_progress';

  select * into v_last from public.biz_guide_exam_attempts
  where user_id = v_uid order by started_at desc, id desc limit 1;
  if found and not v_last.passed then
    /* 沒過 → 同一組 20 題補考 */
    v_qids := v_last.qids;
    v_retake := v_last.retake + 1;
  else
    /* 第一次：從行政同一題庫抽 20 題，之後鎖定 */
    select coalesce(array_agg(qid), '{}') into v_qids from (
      select qid from public.guide_exam_keys order by random() limit 20
    ) s;
    if cardinality(v_qids) = 0 then
      return json_build_object('ok', false, 'error', '題庫尚未匯入');
    end if;
    v_retake := 0;
  end if;

  insert into public.biz_guide_exam_attempts (user_id, username, user_name, retake, qids, deadline_at, total)
  values (v_uid, v_acc.username, coalesce(nullif(v_acc.name, ''), v_acc.username), v_retake, v_qids,
    now() + interval '20 minutes', cardinality(v_qids))
  returning * into v_row;

  return json_build_object('ok', true, 'resumed', false, 'attemptId', v_row.id, 'qids', v_row.qids,
    'retake', v_row.retake, 'deadlineAt', v_row.deadline_at, 'serverNow', now());
end; $$;

create or replace function public.biz_guide_exam_submit(p_token text, p_attempt_id bigint, p_answers jsonb, p_auto boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_row public.biz_guide_exam_attempts%rowtype; v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_results jsonb := '{}'::jsonb; v_correct int := 0; q text; v_key text; v_ok boolean;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_row from public.biz_guide_exam_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'error', '找不到這份考卷'); end if;
  if v_row.status <> 'in_progress' then return json_build_object('ok', false, 'error', '這份考卷已交卷或已作廢'); end if;

  foreach q in array v_row.qids loop
    select answer into v_key from public.guide_exam_keys where qid = q;
    v_ok := v_key is not null and (v_answers ->> q) = v_key;
    if v_ok then v_correct := v_correct + 1; end if;
    v_results := v_results || jsonb_build_object(q, v_ok);
  end loop;

  update public.biz_guide_exam_attempts set
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

  return json_build_object('ok', true, 'attemptId', v_row.id, 'retake', v_row.retake,
    'correct', v_row.correct, 'total', v_row.total, 'passed', v_row.passed, 'results', v_row.results,
    'durationSec', v_row.duration_sec, 'overtime', v_row.overtime, 'autoSubmitted', v_row.auto_submitted,
    'score', case when v_row.total > 0 then round((v_row.correct::numeric / v_row.total) * 100) else 0 end);
end; $$;

create or replace function public.biz_guide_exam_progress(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_last public.biz_guide_exam_attempts%rowtype; v_passed boolean;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  v_passed := exists (select 1 from public.biz_guide_exam_attempts where user_id = v_uid and passed);
  select * into v_last from public.biz_guide_exam_attempts
  where user_id = v_uid and status <> 'in_progress' order by started_at desc, id desc limit 1;
  return json_build_object('ok', true,
    'done', v_passed,
    'pendingRetake', found and not v_last.passed,
    'lastCorrect', case when found then v_last.correct else null end,
    'lastTotal', case when found then v_last.total else null end,
    'lastScore', case when found and v_last.total > 0 then round((v_last.correct::numeric / v_last.total) * 100) else null end,
    'retakeNext', case when found and not v_last.passed then v_last.retake + 1 else 0 end,
    'inProgress', exists (
      select 1 from public.biz_guide_exam_attempts
      where user_id = v_uid and status = 'in_progress' and deadline_at > now()
    ),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select id, retake, status, correct, total, passed, started_at as "startedAt",
        submitted_at as "submittedAt", duration_sec as "durationSec",
        auto_submitted as "autoSubmitted", overtime,
        case when total > 0 and correct is not null then round((correct::numeric / total) * 100) else null end as score
      from public.biz_guide_exam_attempts
      where user_id = v_uid and status <> 'in_progress'
      order by started_at desc, id desc limit 30
    ) x), '[]'::json));
end; $$;

-- 前台公開成績板：登入即可看全員姓名＋成績（不含作答內容）
create or replace function public.biz_guide_exam_board(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  return json_build_object('ok', true,
    'items', coalesce((select json_agg(row_to_json(x) order by x.passed desc, x.score desc nulls last, x.name) from (
      select coalesce(nullif(acc.name, ''), acc.username) as name,
        acc.username,
        (select a.passed from public.biz_guide_exam_attempts a
          where a.user_id = acc.id and a.status = 'submitted'
          order by a.started_at desc, a.id desc limit 1) as passed,
        (select case when a.total > 0 then round((a.correct::numeric / a.total) * 100) else null end
          from public.biz_guide_exam_attempts a
          where a.user_id = acc.id and a.status = 'submitted'
          order by a.started_at desc, a.id desc limit 1) as score,
        (select a.correct from public.biz_guide_exam_attempts a
          where a.user_id = acc.id and a.status = 'submitted'
          order by a.started_at desc, a.id desc limit 1) as correct,
        (select a.total from public.biz_guide_exam_attempts a
          where a.user_id = acc.id and a.status = 'submitted'
          order by a.started_at desc, a.id desc limit 1) as total,
        (select count(*) from public.biz_guide_exam_attempts a
          where a.user_id = acc.id and a.status = 'submitted') as attempts,
        (select max(a.retake) from public.biz_guide_exam_attempts a
          where a.user_id = acc.id) as "maxRetake",
        (select max(a.submitted_at) from public.biz_guide_exam_attempts a
          where a.user_id = acc.id and a.status = 'submitted') as "lastAt",
        exists (
          select 1 from public.biz_guide_exam_attempts a
          where a.user_id = acc.id and a.status = 'in_progress' and a.deadline_at > now()
        ) as "inProgress"
      from public.toolbox_accounts acc
      where exists (select 1 from public.biz_guide_exam_attempts a where a.user_id = acc.id)
        and coalesce(nullif(acc.name, ''), acc.username) <> '簡為倢'
    ) x), '[]'::json));
end; $$;

grant execute on function public.biz_guide_exam_start(text) to anon, authenticated;
grant execute on function public.biz_guide_exam_submit(text, bigint, jsonb, boolean) to anon, authenticated;
grant execute on function public.biz_guide_exam_progress(text) to anon, authenticated;
grant execute on function public.biz_guide_exam_board(text) to anon, authenticated;
