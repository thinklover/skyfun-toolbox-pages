-- AI婷婷後台：以 admin_secret 查看全部對話紀錄（含 AI 回覆與人工回覆）
create or replace function public.ai_tingting_admin_list(
  p_secret text,
  p_limit int default 200,
  p_q text default null,
  p_status text default null,
  p_zone text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lim int := greatest(1, least(coalesce(p_limit, 200), 500));
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_status text := lower(nullif(trim(coalesce(p_status, '')), ''));
  v_zone text := lower(nullif(trim(coalesce(p_zone, '')), ''));
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '密碼錯誤');
  end if;
  if v_status is not null and v_status not in ('pending', 'answered', 'failed') then
    return json_build_object('ok', false, 'error', 'status 無效');
  end if;
  if v_zone is not null and v_zone not in ('admin', 'supervisor') then
    return json_build_object('ok', false, 'error', 'zone 無效');
  end if;

  return json_build_object(
    'ok', true,
    'rows', coalesce((
      select json_agg(j.obj order by j.created_at desc, j.id desc)
      from (
        select
          q.created_at,
          q.id,
          json_build_object(
            'id', q.id,
            'createdAt', q.created_at,
            'answeredAt', q.answered_at,
            'userId', q.user_id,
            'userName', q.user_name,
            'zone', q.zone,
            'status', q.status,
            'question', q.question,
            'answer', coalesce(q.answer, ''),
            'staffAnswer', coalesce(q.staff_answer, ''),
            'staffRepliedBy', coalesce(q.staff_replied_by, ''),
            'staffRepliedAt', q.staff_replied_at
          ) as obj
        from public.ai_tingting_questions q
        where (v_status is null or q.status = v_status)
          and (v_zone is null or q.zone = v_zone)
          and (
            v_q is null
            or q.user_name ilike '%' || v_q || '%'
            or q.question ilike '%' || v_q || '%'
            or coalesce(q.answer, '') ilike '%' || v_q || '%'
            or coalesce(q.staff_answer, '') ilike '%' || v_q || '%'
            or coalesce(q.staff_replied_by, '') ilike '%' || v_q || '%'
          )
        order by q.created_at desc, q.id desc
        limit v_lim
      ) j
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.ai_tingting_admin_list(text, int, text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
