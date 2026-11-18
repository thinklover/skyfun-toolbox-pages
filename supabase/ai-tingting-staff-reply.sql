-- AI婷婷後台：黃怡婷／簡為倢／邱奕棋可人工回覆，並 LINE 通知填寫人

alter table public.ai_tingting_questions
  add column if not exists staff_replied_by text not null default '';

create or replace function public.ai_tingting_staff_reply(
  p_token text,
  p_question_id uuid,
  p_answer text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_me text;
  v_answer text := left(trim(coalesce(p_answer, '')), 4000);
  v_row public.ai_tingting_questions%rowtype;
  v_line json;
  v_msg text;
  v_q_snip text;
  v_a_snip text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;

  select trim(coalesce(nullif(a.name, ''), a.username)) into v_me
  from public.toolbox_accounts a
  where a.id = v_uid;

  if coalesce(v_me, '') = '' then
    return json_build_object('ok', false, 'error', '帳號沒有姓名');
  end if;

  if v_me not in ('黃怡婷', '簡為倢', '邱奕棋') then
    return json_build_object('ok', false, 'error', '沒有人工回覆權限');
  end if;

  if p_question_id is null then
    return json_build_object('ok', false, 'error', '缺少 questionId');
  end if;

  if v_answer = '' then
    return json_build_object('ok', false, 'error', '請輸入回覆內容');
  end if;

  select * into v_row
  from public.ai_tingting_questions
  where id = p_question_id;

  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆問答');
  end if;

  update public.ai_tingting_questions
     set answer = v_answer,
         status = 'answered',
         answered_at = now(),
         staff_replied_by = v_me
   where id = p_question_id
  returning * into v_row;

  v_q_snip := left(trim(coalesce(v_row.question, '')), 200);
  v_a_snip := left(v_answer, 800);
  v_msg := format(
    E'💬 AI婷婷｜人工回覆\n%s 您好：\n您問的問題已由 %s 回覆。\n\n問題：%s\n\n回覆：%s\n\n請至工具箱「AI婷婷 問答」查看。\nhttps://toolbox.skyfunsystem.com/?page=ai-tingting',
    coalesce(nullif(trim(v_row.user_name), ''), '同仁'),
    v_me,
    v_q_snip,
    v_a_snip
  );
  v_line := public.admin_points_line_push(v_row.user_name, v_msg);

  return json_build_object(
    'ok', true,
    'id', v_row.id,
    'status', v_row.status,
    'answer', v_row.answer,
    'answeredAt', v_row.answered_at,
    'staffRepliedBy', v_row.staff_replied_by,
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$$;

revoke all on function public.ai_tingting_staff_reply(text, uuid, text) from public;
grant execute on function public.ai_tingting_staff_reply(text, uuid, text) to anon, authenticated;

-- 後台列表一併回傳 staffRepliedBy
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
            'staffRepliedBy', coalesce(q.staff_replied_by, '')
          ) as obj
        from public.ai_tingting_questions q
        where (v_status is null or q.status = v_status)
          and (v_zone is null or q.zone = v_zone)
          and (
            v_q is null
            or q.user_name ilike '%' || v_q || '%'
            or q.question ilike '%' || v_q || '%'
            or coalesce(q.answer, '') ilike '%' || v_q || '%'
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
