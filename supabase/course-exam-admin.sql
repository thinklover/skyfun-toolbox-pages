-- 行政績效中心後台 › 教育訓練：所有人的課程影片觀看進度、課程考試成績與考試紀錄（後台密碼）
-- 需先套用 course-exam.sql、course-video.sql。

create or replace function public.course_exam_admin_list(p_secret text, p_limit int default 3000)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true,
    'totals', coalesce((select json_object_agg(course, n) from (
      select course, count(*) as n from public.course_exam_keys group by course) t), '{}'::json),
    'people', coalesce((select json_agg(row_to_json(x)) from (
      select coalesce(nullif(acc.name, ''), acc.username) as name, acc.team, a.course,
        bool_or(a.passed) as passed,
        count(*) filter (where a.status = 'submitted') as attempts,
        max(a.correct) filter (where a.status = 'submitted') as best,
        (array_agg(a.correct order by a.submitted_at desc nulls last) filter (where a.status = 'submitted'))[1] as last,
        max(a.total) as total,
        max(a.submitted_at) as "lastAt",
        min(a.submitted_at) filter (where a.passed) as "passedAt"
      from public.course_exam_attempts a
      join public.toolbox_accounts acc on acc.id = a.user_id
      where a.status <> 'in_progress'
      group by acc.id, acc.name, acc.username, acc.team, a.course
    ) x), '[]'::json),
    'videos', coalesce((select json_agg(row_to_json(v)) from (
      select coalesce(nullif(acc.name, ''), acc.username) as name, acc.team, w.course,
        course_video_pct(w.segs, w.duration) as pct, w.completed_at as "completedAt", w.updated_at as "updatedAt"
      from public.course_video_watch w
      join public.toolbox_accounts acc on acc.id = w.user_id
    ) v), '[]'::json),
    'items', coalesce((select json_agg(row_to_json(i)) from (
      select a.id, a.user_name as name, acc.team, a.course, a.retake, a.status, a.correct, a.total, a.passed,
        a.started_at as "startedAt", a.submitted_at as "submittedAt", a.duration_sec as "durationSec",
        a.auto_submitted as "autoSubmitted", a.overtime
      from public.course_exam_attempts a
      left join public.toolbox_accounts acc on acc.id = a.user_id
      where a.status <> 'abandoned'
      order by a.started_at desc, a.id desc limit greatest(1, least(coalesce(p_limit, 3000), 5000))
    ) i), '[]'::json));
end; $$;

grant execute on function public.course_exam_admin_list(text, int) to anon, authenticated;
