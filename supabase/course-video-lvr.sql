-- 實價登錄（lvr）教學影片：開放觀看票與進度回存
-- 2026-10-27

create or replace function public.course_video_ticket(p_token text, p_course text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_ticket uuid; v_w public.course_video_watch%rowtype;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if p_course not in ('obj', 'tenant', 'pre', 'rev', 'p5', 'lvr') then
    return json_build_object('ok', false, 'error', '沒有這個課程影片');
  end if;
  delete from public.course_video_tickets where expires_at < now() - interval '1 day';
  insert into public.course_video_tickets (user_id, course, expires_at)
  values (v_uid, p_course, now() + interval '6 hours') returning ticket into v_ticket;
  select * into v_w from public.course_video_watch where user_id = v_uid and course = p_course;
  return json_build_object('ok', true, 'ticket', v_ticket,
    'segs', coalesce(v_w.segs, '{}'), 'duration', coalesce(v_w.duration, 0),
    'pct', course_video_pct(coalesce(v_w.segs, '{}'), coalesce(v_w.duration, 0)), 'completedAt', v_w.completed_at);
end; $$;

create or replace function public.course_video_save(p_token text, p_course text, p_segs int[], p_duration int)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_dur int; v_max int; v_segs int[]; v_pct int; v_done timestamptz;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if p_course not in ('obj', 'tenant', 'pre', 'rev', 'p5', 'lvr') then
    return json_build_object('ok', false, 'error', '沒有這個課程影片');
  end if;
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

grant execute on function public.course_video_ticket(text, text) to anon, authenticated;
grant execute on function public.course_video_save(text, text, int[], int) to anon, authenticated;
