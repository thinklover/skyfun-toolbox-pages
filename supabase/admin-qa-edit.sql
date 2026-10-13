-- 行政 QA：列表依審核狀態分區（已通過依通過時間排序），黃怡婷可直接修改問題與回答
-- 修改不影響檢核狀態與點數，只記錄修改人與時間

alter table public.admin_qa_questions
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by text not null default '';

alter table public.admin_qa_answers
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by text not null default '';

create or replace function public.admin_qa_can_edit(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.toolbox_accounts a
    where a.id = p_user_id and a.status = 'active'
      and trim(coalesce(nullif(a.name, ''), a.username)) = '黃怡婷'
  );
$$;
revoke all on function public.admin_qa_can_edit(uuid) from public, anon, authenticated;

create or replace function public.admin_qa_list(
  p_token text,
  p_query text default '',
  p_limit int default 30,
  p_offset int default 0,
  p_category text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid; v_q text; v_cat text; v_lim int; v_off int;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  v_q := trim(coalesce(p_query, ''));
  v_cat := trim(coalesce(p_category, ''));
  if v_cat <> '' and v_cat not in ('system', 'subsidy300', 'review', 'guild', 'other') then
    return json_build_object('ok', false, 'error', '分類無效');
  end if;
  v_lim := greatest(1, least(coalesce(p_limit, 30), 200));
  v_off := greatest(coalesce(p_offset, 0), 0);
  return json_build_object('ok', true, 'items', coalesce((
    select json_agg(row_to_json(x)) from (
      select q.id, q.title, q.body, q.status, q.category,
        q.ask_review_status as "askReviewStatus", q.ask_reviewed_at as "askReviewedAt",
        q.asker_name as "askerName", q.created_at as "createdAt", coalesce(q.images, '{}'::text[]) as images,
        coalesce(q.files, '{}'::text[]) as files,
        q.is_quality as "isQuality",
        coalesce((select bool_or(a.is_quality) from public.admin_qa_answers a where a.question_id = q.id), false) as "hasQualityAnswer",
        (select count(*)::int from public.admin_qa_answers a where a.question_id = q.id) as "answerCount",
        admin_qa_is_double_points(q.asker_id) as "isDoublePoints"
      from public.admin_qa_questions q
      where (v_cat = '' or q.category = v_cat)
        and (v_q = '' or q.title ilike '%' || v_q || '%' or q.body ilike '%' || v_q || '%'
          or exists (select 1 from public.admin_qa_answers a where a.question_id = q.id and a.body ilike '%' || v_q || '%'))
      order by case q.ask_review_status when 'approved' then 0 when 'pending' then 1 else 2 end,
        case when q.ask_review_status = 'approved' then q.ask_reviewed_at end desc nulls last,
        q.created_at desc
      limit v_lim offset v_off
    ) x
  ), '[]'::json));
end;
$$;

create or replace function public.admin_qa_get(p_token text, p_question_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  return json_build_object(
    'ok', true,
    'canEdit', admin_qa_can_edit(v_uid),
    'question', (
      select row_to_json(q)
      from (
        select
          id, title, body, status, category,
          ask_review_status as "askReviewStatus",
          ask_review_note as "askReviewNote",
          ask_reviewed_at as "askReviewedAt",
          coalesce(ask_reviewed_by, '') as "askReviewedBy",
          asker_id as "askerId",
          asker_name as "askerName",
          created_at as "createdAt",
          edited_at as "editedAt",
          edited_by as "editedBy",
          coalesce(images, '{}'::text[]) as images,
          coalesce(files, '{}'::text[]) as files,
          is_quality as "isQuality",
          admin_qa_is_double_points(asker_id) as "isDoublePoints"
        from public.admin_qa_questions
        where id = p_question_id
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
          edited_at as "editedAt",
          edited_by as "editedBy",
          coalesce(images, '{}'::text[]) as images,
          coalesce(files, '{}'::text[]) as files,
          is_quality as "isQuality",
          admin_qa_is_double_points(answerer_id) as "isDoublePoints"
        from public.admin_qa_answers
        where question_id = p_question_id
        order by created_at
      ) t
    ), '[]'::json)
  );
end;
$$;

create or replace function public.admin_qa_edit_question(
  p_token text,
  p_question_id uuid,
  p_title text,
  p_body text,
  p_category text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid; v_title text; v_cat text;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if not admin_qa_can_edit(v_uid) then return json_build_object('ok', false, 'error', '您沒有修改問答的權限'); end if;
  v_title := trim(coalesce(p_title, ''));
  if length(v_title) < 4 then return json_build_object('ok', false, 'error', '標題至少 4 個字'); end if;
  v_cat := trim(coalesce(p_category, ''));
  if v_cat not in ('system', 'subsidy300', 'review', 'guild', 'other') then
    return json_build_object('ok', false, 'error', '請選擇問題分類');
  end if;
  update public.admin_qa_questions
  set title = v_title, body = trim(coalesce(p_body, '')), category = v_cat,
      edited_at = now(), edited_by = admin_qa_reviewer_label(p_token)
  where id = p_question_id;
  if not found then return json_build_object('ok', false, 'error', '找不到問題'); end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_qa_edit_answer(p_token text, p_answer_id uuid, p_body text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid; v_body text;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if not admin_qa_can_edit(v_uid) then return json_build_object('ok', false, 'error', '您沒有修改問答的權限'); end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) < 4 then return json_build_object('ok', false, 'error', '回答至少 4 個字'); end if;
  update public.admin_qa_answers
  set body = v_body, edited_at = now(), edited_by = admin_qa_reviewer_label(p_token)
  where id = p_answer_id;
  if not found then return json_build_object('ok', false, 'error', '找不到回答'); end if;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_qa_list(text, text, int, int, text) to anon, authenticated;
grant execute on function public.admin_qa_get(text, uuid) to anon, authenticated;
grant execute on function public.admin_qa_edit_question(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.admin_qa_edit_answer(text, uuid, text) to anon, authenticated;
