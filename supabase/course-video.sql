-- 行政點數表 › 教育訓練 › 課程教學影片（物審 obj、房客 tenant、預審 pre、複審 rev）
-- 影片放在 Cloudflare R2（私有），由 skyfun-training-video Worker 播放；播放前先用登入 token 換一張 6 小時有效的觀看票，
-- Worker 用 course_video_ticket_check 驗票（不需要共用密鑰）。觀看進度以 10 秒為一格記錄，看過 95% 以上算看完。

create table if not exists public.course_video_tickets (
  ticket uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  course text not null,
  expires_at timestamptz not null
);
create index if not exists course_video_tickets_exp_idx on public.course_video_tickets (expires_at);
alter table public.course_video_tickets enable row level security;
revoke all on public.course_video_tickets from anon, authenticated;

create table if not exists public.course_video_watch (
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  course text not null,
  duration int not null default 0,
  segs int[] not null default '{}',
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, course)
);
alter table public.course_video_watch enable row level security;
revoke all on public.course_video_watch from anon, authenticated;

create or replace function public.course_video_pct(p_segs int[], p_duration int)
returns int language sql immutable as $$
  select case when coalesce(p_duration, 0) <= 0 then 0
    else least(100, floor(cardinality(p_segs) * 100.0 / ceil(p_duration / 10.0)))::int end;
$$;

-- 換觀看票＋讀自己的觀看進度
create or replace function public.course_video_ticket(p_token text, p_course text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_ticket uuid; v_w public.course_video_watch%rowtype;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if p_course not in ('obj', 'tenant', 'pre', 'rev') then return json_build_object('ok', false, 'error', '沒有這個課程影片'); end if;
  delete from public.course_video_tickets where expires_at < now() - interval '1 day';
  insert into public.course_video_tickets (user_id, course, expires_at)
  values (v_uid, p_course, now() + interval '6 hours') returning ticket into v_ticket;
  select * into v_w from public.course_video_watch where user_id = v_uid and course = p_course;
  return json_build_object('ok', true, 'ticket', v_ticket,
    'segs', coalesce(v_w.segs, '{}'), 'duration', coalesce(v_w.duration, 0),
    'pct', course_video_pct(coalesce(v_w.segs, '{}'), coalesce(v_w.duration, 0)), 'completedAt', v_w.completed_at);
end; $$;

-- Worker 驗票（只回傳有效與否）
create or replace function public.course_video_ticket_check(p_ticket uuid, p_course text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.course_video_tickets where ticket = p_ticket and course = p_course and expires_at > now());
$$;

-- 回存觀看進度（10 秒一格，合併去重；看過 95% 以上記錄看完時間）
create or replace function public.course_video_save(p_token text, p_course text, p_segs int[], p_duration int)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_dur int; v_max int; v_segs int[]; v_pct int; v_done timestamptz;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if p_course not in ('obj', 'tenant', 'pre', 'rev') then return json_build_object('ok', false, 'error', '沒有這個課程影片'); end if;
  v_dur := least(greatest(coalesce(p_duration, 0), 0), 4 * 3600);
  select greatest(v_dur, coalesce(max(duration), 0)) into v_dur from public.course_video_watch where user_id = v_uid and course = p_course;
  v_max := ceil(v_dur / 10.0)::int - 1;
  select coalesce(array_agg(distinct s order by s), '{}') into v_segs from (
    select unnest(segs) s from public.course_video_watch where user_id = v_uid and course = p_course
    union select unnest(coalesce(p_segs, '{}'))
  ) x where s between 0 and v_max;
  v_pct := course_video_pct(v_segs, v_dur);
  insert into public.course_video_watch as w (user_id, course, duration, segs, completed_at, updated_at)
  values (v_uid, p_course, v_dur, v_segs, case when v_pct >= 95 then now() end, now())
  on conflict (user_id, course) do update set
    duration = excluded.duration, segs = excluded.segs, updated_at = now(),
    completed_at = coalesce(w.completed_at, excluded.completed_at)
  returning completed_at into v_done;
  return json_build_object('ok', true, 'pct', v_pct, 'completedAt', v_done);
end; $$;

-- 點數表：所有人各課程的考試狀態＋影片觀看進度（依帳號姓名；不含作答與答案）
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
    ) x), '[]'::json),
    'videos', coalesce((select json_agg(row_to_json(v)) from (
      select coalesce(nullif(acc.name, ''), acc.username) as name, w.course,
        course_video_pct(w.segs, w.duration) as pct, w.completed_at as "completedAt", w.updated_at as "updatedAt"
      from public.course_video_watch w
      join public.toolbox_accounts acc on acc.id = w.user_id
    ) v), '[]'::json));
end; $$;

revoke all on function public.course_video_pct(int[], int) from public, anon, authenticated;
grant execute on function public.course_video_ticket(text, text) to anon, authenticated;
grant execute on function public.course_video_ticket_check(uuid, text) to anon, authenticated;
grant execute on function public.course_video_save(text, text, int[], int) to anon, authenticated;
