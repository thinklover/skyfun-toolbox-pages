-- 記錄誰讓問題／回答通過（或未通過）
-- 已於正式庫套用；本檔供文件與重跑參考

alter table public.admin_qa_questions
  add column if not exists ask_reviewed_by text not null default '';

alter table public.admin_qa_answers
  add column if not exists reviewed_by text not null default '';

create or replace function public.admin_qa_reviewer_label(p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(nullif(trim(a.name), ''), nullif(trim(a.username), ''), '')
      from public.toolbox_accounts a
      where a.id = public.admin_qa_user_id(p_token)
    ),
    ''
  );
$$;

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

create or replace function public.admin_qa_admin_review_answer(
  p_secret text,
  p_answer_id uuid,
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
  v_a public.admin_qa_answers%rowtype;
  v_award int;
  v_quality boolean;
  v_reviewer text;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_action not in ('approved', 'rejected') then
    return json_build_object('ok', false, 'error', '動作無效');
  end if;
  v_quality := coalesce(p_quality, false) and admin_qa_can_set_quality(admin_qa_user_id(p_token));
  v_reviewer := admin_qa_reviewer_label(p_token);
  select * into v_a from public.admin_qa_answers where id = p_answer_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '找不到回答');
  end if;
  if v_a.review_status <> 'pending' then
    return json_build_object('ok', false, 'error', '此回答已檢核過');
  end if;
  update public.admin_qa_answers
  set review_status = p_action,
      reviewed_at = now(),
      review_note = p_note,
      reviewed_by = v_reviewer,
      is_quality = case when p_action = 'approved' and v_quality then true else false end
  where id = p_answer_id;
  if p_action = 'approved' then
    v_award := admin_qa_award_points(v_a.answerer_id, 'answer', v_quality);
    insert into public.admin_qa_point_events(user_id, user_name, event_type, question_id, answer_id, points, status, reviewed_at)
    values (v_a.answerer_id, v_a.answerer_name, 'answer', v_a.question_id, v_a.id, v_award, 'approved', now());
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

create or replace function public.admin_qa_admin_list_questions(
  p_secret text,
  p_query text default '',
  p_limit int default 100,
  p_offset int default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q text;
  v_lim int;
  v_off int;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  v_q := trim(coalesce(p_query, ''));
  v_lim := greatest(1, least(coalesce(p_limit, 100), 200));
  v_off := greatest(coalesce(p_offset, 0), 0);

  return json_build_object(
    'ok', true,
    'total', (
      select count(*)::int from public.admin_qa_questions q
      where v_q = ''
        or q.title ilike '%' || v_q || '%'
        or q.body ilike '%' || v_q || '%'
        or q.asker_name ilike '%' || v_q || '%'
    ),
    'items', coalesce((
      select json_agg(row_to_json(t))
      from (
        select
          q.id,
          q.title,
          q.body,
          q.asker_name as "askerName",
          q.ask_review_status as "askReviewStatus",
          q.ask_review_note as "askReviewNote",
          q.ask_reviewed_at as "askReviewedAt",
          coalesce(q.ask_reviewed_by, '') as "askReviewedBy",
          q.status,
          q.created_at as "createdAt",
          q.is_quality as "isQuality",
          coalesce((select bool_or(a.is_quality) from public.admin_qa_answers a where a.question_id = q.id), false) as "hasQualityAnswer",
          (select count(*)::int from public.admin_qa_answers a where a.question_id = q.id) as "answerCount"
        from public.admin_qa_questions q
        where v_q = ''
          or q.title ilike '%' || v_q || '%'
          or q.body ilike '%' || v_q || '%'
          or q.asker_name ilike '%' || v_q || '%'
        order by q.created_at desc
        limit v_lim offset v_off
      ) t
    ), '[]'::json)
  );
end;
$$;

create or replace function public.admin_qa_admin_get_question(p_secret text, p_question_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if not exists (select 1 from public.admin_qa_questions where id = p_question_id) then
    return json_build_object('ok', false, 'error', '找不到問題');
  end if;
  return json_build_object(
    'ok', true,
    'question', (
      select row_to_json(q) from (
        select
          id, title, body, status,
          ask_review_status as "askReviewStatus",
          ask_review_note as "askReviewNote",
          ask_reviewed_at as "askReviewedAt",
          coalesce(ask_reviewed_by, '') as "askReviewedBy",
          asker_name as "askerName",
          created_at as "createdAt",
          is_quality as "isQuality",
          coalesce(images, '{}'::text[]) as images,
          coalesce(files, '{}'::text[]) as files
        from public.admin_qa_questions where id = p_question_id
      ) q
    ),
    'answers', coalesce((
      select json_agg(row_to_json(t))
      from (
        select
          id, body,
          answerer_name as "answererName",
          review_status as "reviewStatus",
          review_note as "reviewNote",
          reviewed_at as "reviewedAt",
          coalesce(reviewed_by, '') as "reviewedBy",
          created_at as "createdAt",
          is_quality as "isQuality",
          coalesce(images, '{}'::text[]) as images,
          coalesce(files, '{}'::text[]) as files
        from public.admin_qa_answers
        where question_id = p_question_id
        order by created_at
      ) t
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.admin_qa_reviewer_label(text) to anon, authenticated;
