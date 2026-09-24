-- 通過問題前必須至少有一則回答（不通過仍可）
-- 已於正式庫套用

create or replace function public.admin_qa_admin_review_question(
  p_secret text,
  p_question_id uuid,
  p_action text,
  p_note text default null,
  p_quality boolean default false,
  p_token text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q public.admin_qa_questions%rowtype;
  v_award int;
  v_quality boolean;
  v_reviewer text;
  v_answer_count int;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_action not in ('approved', 'rejected') then
    return json_build_object('ok', false, 'error', '動作無效');
  end if;
  v_quality := coalesce(p_quality, false) and admin_qa_can_set_quality(admin_qa_user_id(p_token));
  v_reviewer := admin_qa_reviewer_label(p_token);
  select * into v_q from public.admin_qa_questions where id = p_question_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '找不到問題');
  end if;
  if v_q.ask_review_status <> 'pending' then
    return json_build_object('ok', false, 'error', '此問題已檢核過');
  end if;

  if p_action = 'approved' then
    select count(*)::int into v_answer_count
    from public.admin_qa_answers
    where question_id = p_question_id;
    if coalesce(v_answer_count, 0) < 1 then
      return json_build_object('ok', false, 'error', '尚無回答，請先有人回答後才能通過此問題');
    end if;
  end if;

  update public.admin_qa_questions
  set ask_review_status = p_action,
      ask_reviewed_at = now(),
      ask_review_note = p_note,
      ask_reviewed_by = v_reviewer,
      is_quality = case when p_action = 'approved' and v_quality then true else false end
  where id = p_question_id;

  if p_action = 'approved' then
    v_award := admin_qa_award_points(v_q.asker_id, 'ask', v_quality);
    insert into public.admin_qa_point_events(user_id, user_name, event_type, question_id, points, status, reviewed_at)
    values (v_q.asker_id, v_q.asker_name, 'ask', v_q.id, v_award, 'approved', now());
  end if;

  return json_build_object(
    'ok', true,
    'status', p_action,
    'pointsAwarded', coalesce(v_award, 0),
    'isQuality', v_quality,
    'reviewedBy', v_reviewer
  );
end;
$$;
