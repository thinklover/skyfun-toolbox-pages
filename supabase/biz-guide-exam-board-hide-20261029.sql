-- 公開成績板不顯示簡為倢（測考／督導用帳）
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

revoke all on function public.biz_guide_exam_board(text) from public;
grant execute on function public.biz_guide_exam_board(text) to anon, authenticated;
