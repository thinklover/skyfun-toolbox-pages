-- 行政 QA：問答、關鍵字搜尋、小組長檢核點數（之後可匯出 Google Sheet）
-- 在 Supabase SQL Editor 執行（需已有 toolbox_accounts / toolbox_sessions）

create table if not exists public.admin_qa_questions (
  id uuid primary key default gen_random_uuid(),
  asker_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  asker_name text not null default '',
  title text not null,
  body text not null default '',
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  ask_review_status text not null default 'pending'
    check (ask_review_status in ('pending', 'approved', 'rejected')),
  ask_reviewed_at timestamptz,
  ask_review_note text,
  category text not null default 'other'
    check (category in ('system', 'subsidy300', 'review', 'guild', 'other')),
  images text[] not null default '{}',
  files text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists admin_qa_questions_category_idx on public.admin_qa_questions (category, created_at desc);

create index if not exists admin_qa_questions_created_idx on public.admin_qa_questions (created_at desc);
create index if not exists admin_qa_questions_ask_review_idx on public.admin_qa_questions (ask_review_status);

create table if not exists public.admin_qa_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.admin_qa_questions(id) on delete cascade,
  answerer_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  answerer_name text not null default '',
  body text not null,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  review_note text,
  images text[] not null default '{}',
  files text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists admin_qa_answers_question_idx on public.admin_qa_answers (question_id, created_at);
create index if not exists admin_qa_answers_review_idx on public.admin_qa_answers (review_status);

-- 點數事件（檢核通過才計入；供 Google Sheet 同步）
create table if not exists public.admin_qa_point_events (
  id bigserial primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  user_name text not null default '',
  event_type text not null check (event_type in ('ask', 'answer')),
  question_id uuid references public.admin_qa_questions(id) on delete set null,
  answer_id uuid references public.admin_qa_answers(id) on delete set null,
  points int not null default 1,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  sheets_exported_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_qa_point_events_user_idx on public.admin_qa_point_events (user_id, event_type, status);

-- 特定帳號檢核通過可獲雙倍 QA 點數（預設 false）
alter table public.toolbox_accounts
  add column if not exists admin_qa_double_points boolean not null default false;

alter table public.admin_qa_questions enable row level security;
alter table public.admin_qa_answers enable row level security;
alter table public.admin_qa_point_events enable row level security;
revoke all on public.admin_qa_questions from anon, authenticated;
revoke all on public.admin_qa_answers from anon, authenticated;
revoke all on public.admin_qa_point_events from anon, authenticated;

-- ========== helpers ==========

create or replace function public.admin_qa_user_id(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid;
begin
  select s.user_id into v_uid
  from public.toolbox_sessions s
  join public.toolbox_accounts a on a.id = s.user_id
  where s.token = trim(coalesce(p_token, ''))
    and s.expires_at >= now()
    and a.status = 'active';
  return v_uid;
end;
$$;

create or replace function public.admin_qa_can_participate(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select trim(coalesce(team, '')) = '行政管理部'
     from public.toolbox_accounts
     where id = p_user_id),
    false
  );
$$;

create or replace function public.admin_qa_period_start(p_at timestamptz default now())
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_local date;
  v_y int;
  v_m int;
  v_d int;
begin
  v_local := (coalesce(p_at, now()) at time zone 'Asia/Taipei')::date;
  v_y := extract(year from v_local)::int;
  v_m := extract(month from v_local)::int;
  v_d := extract(day from v_local)::int;
  if v_d >= 29 then
    return make_timestamptz(v_y, v_m, 29, 0, 0, 0, 'Asia/Taipei');
  end if;
  if v_m = 1 then
    return make_timestamptz(v_y - 1, 12, 29, 0, 0, 0, 'Asia/Taipei');
  end if;
  return make_timestamptz(v_y, v_m - 1, 29, 0, 0, 0, 'Asia/Taipei');
end;
$$;

create or replace function public.admin_qa_period_end(p_at timestamptz default now())
returns timestamptz
language sql
stable
set search_path = public
as $$
  select public.admin_qa_period_start(p_at) + interval '1 month' - interval '1 day';
$$;

create or replace function public.admin_qa_user_points(p_user_id uuid, p_type text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(points), 0)::int
  from public.admin_qa_point_events
  where user_id = p_user_id
    and event_type = p_type
    and status = 'approved'
    and coalesce(reviewed_at, created_at) >= public.admin_qa_period_start()
    and coalesce(reviewed_at, created_at) < public.admin_qa_period_start() + interval '1 month';
$$;

create or replace function public.admin_qa_is_double_points(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select admin_qa_double_points from public.toolbox_accounts where id = p_user_id),
    false
  );
$$;

create or replace function public.admin_qa_points_to_award(
  p_user_id uuid,
  p_current int,
  p_cap int,
  p_event_type text default 'ask'
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base int;
  v_room int;
begin
  if coalesce(p_event_type, 'ask') = 'answer' then
    v_base := case when admin_qa_is_double_points(p_user_id) then 4 else 2 end;
  else
    v_base := case when admin_qa_is_double_points(p_user_id) then 2 else 1 end;
  end if;
  v_room := p_cap - coalesce(p_current, 0);
  if v_room <= 0 then
    return 0;
  end if;
  return least(v_base, v_room);
end;
$$;

create or replace function public.admin_qa_validate_images(p_user_id uuid, p_images text[])
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base text := 'https://xpbownhiedurytlyqszu.supabase.co/storage/v1/object/public/admin-qa-images/';
  v_prefix text;
  v_img text;
  v_out text[] := '{}';
  v_cnt int;
begin
  v_prefix := p_user_id::text || '/';
  v_cnt := coalesce(array_length(p_images, 1), 0);
  if v_cnt > 4 then
    raise exception '最多 4 張圖片';
  end if;
  if v_cnt = 0 then
    return v_out;
  end if;
  foreach v_img in array coalesce(p_images, '{}')
  loop
    v_img := trim(coalesce(v_img, ''));
    if v_img = '' then continue; end if;
    if not v_img like v_base || '%' then
      raise exception '圖片網址無效';
    end if;
    if not replace(v_img, v_base, '') like v_prefix || '%' then
      raise exception '圖片必須由本人上傳';
    end if;
    v_out := array_append(v_out, v_img);
  end loop;
  return v_out;
end;
$$;

create or replace function public.admin_qa_validate_files(p_user_id uuid, p_files text[])
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base text := 'https://xpbownhiedurytlyqszu.supabase.co/storage/v1/object/public/admin-qa-files/';
  v_prefix text;
  v_file text;
  v_out text[] := '{}';
  v_cnt int;
  v_ext text;
begin
  v_prefix := p_user_id::text || '/';
  v_cnt := coalesce(array_length(p_files, 1), 0);
  if v_cnt > 4 then
    raise exception '最多 4 個檔案';
  end if;
  if v_cnt = 0 then
    return v_out;
  end if;
  foreach v_file in array coalesce(p_files, '{}')
  loop
    v_file := trim(coalesce(v_file, ''));
    if v_file = '' then continue; end if;
    if not v_file like v_base || '%' then
      raise exception '檔案網址無效';
    end if;
    if not replace(v_file, v_base, '') like v_prefix || '%' then
      raise exception '檔案必須由本人上傳';
    end if;
    v_ext := lower(regexp_replace(v_file, '.*\\.', ''));
    if v_ext not in ('pdf','doc','docx','xls','xlsx','ppt','pptx','zip','rar','7z','txt','csv') then
      raise exception '不支援的檔案格式';
    end if;
    v_out := array_append(v_out, v_file);
  end loop;
  return v_out;
end;
$$;

create or replace function public.admin_qa_prepare_upload(p_token text, p_ext text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_ext text;
  v_path text;
  v_base text := 'https://xpbownhiedurytlyqszu.supabase.co/storage/v1/object/public/admin-qa-images/';
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  if not admin_qa_can_participate(v_uid) then
    return json_build_object('ok', false, 'error', '僅行政管理部同仁可提問與回答');
  end if;
  v_ext := lower(trim(coalesce(p_ext, 'jpg')));
  v_ext := regexp_replace(v_ext, '[^a-z0-9]', '', 'g');
  if v_ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp') then
    v_ext := 'jpg';
  end if;
  v_path := v_uid::text || '/' || gen_random_uuid()::text || '.' || v_ext;
  return json_build_object(
    'ok', true,
    'path', v_path,
    'publicUrl', v_base || v_path
  );
end;
$$;

create or replace function public.admin_qa_prepare_file_upload(p_token text, p_ext text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_ext text;
  v_path text;
  v_base text := 'https://xpbownhiedurytlyqszu.supabase.co/storage/v1/object/public/admin-qa-files/';
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  if not admin_qa_can_participate(v_uid) then
    return json_build_object('ok', false, 'error', '僅行政管理部同仁可提問與回答');
  end if;
  v_ext := lower(trim(coalesce(p_ext, 'pdf')));
  v_ext := regexp_replace(v_ext, '[^a-z0-9]', '', 'g');
  if v_ext not in ('pdf','doc','docx','xls','xlsx','ppt','pptx','zip','rar','7z','txt','csv') then
    return json_build_object('ok', false, 'error', '不支援的檔案格式');
  end if;
  v_path := v_uid::text || '/' || gen_random_uuid()::text || '.' || v_ext;
  return json_build_object(
    'ok', true,
    'path', v_path,
    'publicUrl', v_base || v_path
  );
end;
$$;

create or replace function public.admin_qa_validate_category(p_category text)
returns text
language plpgsql
immutable
as $$
declare v_cat text;
begin
  v_cat := trim(coalesce(p_category, ''));
  if v_cat not in ('system', 'subsidy300', 'review', 'guild', 'other') then
    raise exception '請選擇問題分類';
  end if;
  return v_cat;
end;
$$;

-- ========== list / search ==========

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
declare
  v_uid uuid;
  v_q text;
  v_cat text;
  v_lim int;
  v_off int;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  v_q := trim(coalesce(p_query, ''));
  v_cat := trim(coalesce(p_category, ''));
  if v_cat <> '' and v_cat not in ('system', 'subsidy300', 'review', 'guild', 'other') then
    return json_build_object('ok', false, 'error', '分類無效');
  end if;
  v_lim := greatest(1, least(coalesce(p_limit, 30), 50));
  v_off := greatest(coalesce(p_offset, 0), 0);

  return json_build_object(
    'ok', true,
    'items', coalesce((
      select json_agg(row_to_json(x))
      from (
        select
          q.id,
          q.title,
          q.body,
          q.status,
          q.category,
          q.ask_review_status as "askReviewStatus",
          q.asker_name as "askerName",
          q.created_at as "createdAt",
          coalesce(q.images, '{}'::text[]) as images,
          q.is_quality as "isQuality",
          coalesce((select bool_or(a.is_quality) from public.admin_qa_answers a where a.question_id = q.id), false) as "hasQualityAnswer",
          (select count(*)::int from public.admin_qa_answers a where a.question_id = q.id) as "answerCount",
          admin_qa_is_double_points(q.asker_id) as "isDoublePoints"
        from public.admin_qa_questions q
        where (v_cat = '' or q.category = v_cat)
          and (
            v_q = ''
            or q.title ilike '%' || v_q || '%'
            or q.body ilike '%' || v_q || '%'
            or exists (
              select 1 from public.admin_qa_answers a
              where a.question_id = q.id and a.body ilike '%' || v_q || '%'
            )
          )
        order by q.created_at desc
        limit v_lim offset v_off
      ) x
    ), '[]'::json)
  );
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
    'question', (
      select row_to_json(q)
      from (
        select
          id, title, body, status, category,
          ask_review_status as "askReviewStatus",
          ask_review_note as "askReviewNote",
          asker_id as "askerId",
          asker_name as "askerName",
          created_at as "createdAt",
          coalesce(images, '{}'::text[]) as images,
          coalesce(files, '{}'::text[]) as files,
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
          created_at as "createdAt",
          coalesce(images, '{}'::text[]) as images,
          coalesce(files, '{}'::text[]) as files,
          admin_qa_is_double_points(answerer_id) as "isDoublePoints"
        from public.admin_qa_answers
        where question_id = p_question_id
        order by created_at
      ) t
    ), '[]'::json)
  );
end;
$$;

-- ========== ask / answer ==========

create or replace function public.admin_qa_ask(
  p_token text,
  p_title text,
  p_body text default '',
  p_images text[] default '{}',
  p_category text default '',
  p_files text[] default '{}'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_name text;
  v_id uuid;
  v_title text;
  v_body text;
  v_images text[];
  v_files text[];
  v_category text;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  if not admin_qa_can_participate(v_uid) then
    return json_build_object('ok', false, 'error', '僅行政管理部同仁可提問與回答');
  end if;
  v_title := trim(coalesce(p_title, ''));
  v_body := trim(coalesce(p_body, ''));
  if length(v_title) < 4 then
    return json_build_object('ok', false, 'error', '標題至少 4 個字');
  end if;
  begin
    v_category := admin_qa_validate_category(p_category);
  exception when others then
    return json_build_object('ok', false, 'error', SQLERRM);
  end;
  begin
    v_images := admin_qa_validate_images(v_uid, coalesce(p_images, '{}'));
  exception when others then
    return json_build_object('ok', false, 'error', SQLERRM);
  end;
  begin
    v_files := admin_qa_validate_files(v_uid, coalesce(p_files, '{}'));
  exception when others then
    return json_build_object('ok', false, 'error', SQLERRM);
  end;
  select coalesce(nullif(name, ''), username, '') into v_name
  from public.toolbox_accounts where id = v_uid;

  insert into public.admin_qa_questions(asker_id, asker_name, title, body, images, files, category)
  values (v_uid, v_name, v_title, v_body, v_images, v_files, v_category)
  returning id into v_id;

  return json_build_object(
    'ok', true,
    'id', v_id,
    'message', '問題已送出，待小組長檢核通過後可獲得提問點數（認列至多 50 點，超出仍計入排行榜）'
  );
end;
$$;

create or replace function public.admin_qa_answer(
  p_token text,
  p_question_id uuid,
  p_body text,
  p_images text[] default '{}',
  p_files text[] default '{}'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_name text;
  v_id uuid;
  v_body text;
  v_images text[];
  v_files text[];
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  if not admin_qa_can_participate(v_uid) then
    return json_build_object('ok', false, 'error', '僅行政管理部同仁可提問與回答');
  end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) < 4 then
    return json_build_object('ok', false, 'error', '回答至少 4 個字');
  end if;
  if not exists (select 1 from public.admin_qa_questions where id = p_question_id) then
    return json_build_object('ok', false, 'error', '找不到問題');
  end if;
  begin
    v_images := admin_qa_validate_images(v_uid, coalesce(p_images, '{}'));
  exception when others then
    return json_build_object('ok', false, 'error', SQLERRM);
  end;
  begin
    v_files := admin_qa_validate_files(v_uid, coalesce(p_files, '{}'));
  exception when others then
    return json_build_object('ok', false, 'error', SQLERRM);
  end;
  select coalesce(nullif(name, ''), username, '') into v_name
  from public.toolbox_accounts where id = v_uid;

  insert into public.admin_qa_answers(question_id, answerer_id, answerer_name, body, images, files)
  values (p_question_id, v_uid, v_name, v_body, v_images, v_files)
  returning id into v_id;

  update public.admin_qa_questions
  set status = 'answered'
  where id = p_question_id and status = 'open';

  return json_build_object(
    'ok', true,
    'id', v_id,
    'message', '回答已送出，待小組長檢核通過後可獲得 2 點回答點數（認列至多 50 點，超出仍計入排行榜）'
  );
end;
$$;

-- ========== my stats ==========

create or replace function public.admin_qa_my_stats(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_ask int;
  v_ans int;
  v_start timestamptz;
  v_end date;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  v_start := public.admin_qa_period_start();
  v_end := (public.admin_qa_period_end())::date;
  v_ask := admin_qa_user_points(v_uid, 'ask');
  v_ans := admin_qa_user_points(v_uid, 'answer');
  return json_build_object(
    'ok', true,
    'canParticipate', admin_qa_can_participate(v_uid),
    'periodFrom', to_char(v_start at time zone 'Asia/Taipei', 'YYYY/MM/DD'),
    'periodTo', to_char(v_end, 'YYYY/MM/DD'),
    'askPoints', least(v_ask, 50),
    'askTotal', v_ask,
    'askCap', 50,
    'answerPoints', least(v_ans, 50),
    'answerTotal', v_ans,
    'answerCap', 50,
    'rankPoints', v_ask + v_ans,
    'pendingAskReviews', (
      select count(*)::int from public.admin_qa_questions
      where asker_id = v_uid and ask_review_status = 'pending'
    ),
    'pendingAnswerReviews', (
      select count(*)::int from public.admin_qa_answers
      where answerer_id = v_uid and review_status = 'pending'
    )
  );
end;
$$;

-- ========== admin review ==========

create or replace function public.admin_qa_admin_pending(p_secret text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  return json_build_object(
    'ok', true,
    'questions', coalesce((
      select json_agg(row_to_json(x))
      from (
        select id, title, body, category, asker_name as "askerName", created_at as "createdAt",
          coalesce(images, '{}'::text[]) as images,
          admin_qa_is_double_points(asker_id) as "isDoublePoints"
        from public.admin_qa_questions
        where ask_review_status = 'pending'
        order by created_at
        limit 200
      ) x
    ), '[]'::json),
    'answers', coalesce((
      select json_agg(row_to_json(x))
      from (
        select
          a.id, a.body, a.answerer_name as "answererName", a.created_at as "createdAt",
          q.title as "questionTitle", q.body as "questionBody", q.asker_name as "questionAskerName",
          q.created_at as "questionCreatedAt", q.id as "questionId", q.category as "questionCategory",
          coalesce(q.images, '{}'::text[]) as "questionImages",
          coalesce(a.images, '{}'::text[]) as images,
          admin_qa_is_double_points(a.answerer_id) as "isDoublePoints"
        from public.admin_qa_answers a
        join public.admin_qa_questions q on q.id = a.question_id
        where a.review_status = 'pending'
        order by a.created_at
        limit 200
      ) x
    ), '[]'::json)
  );
end;
$$;

create or replace function public.admin_qa_admin_review_question(
  p_secret text,
  p_question_id uuid,
  p_action text,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q public.admin_qa_questions%rowtype;
  v_pts int;
  v_award int;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_action not in ('approved', 'rejected') then
    return json_build_object('ok', false, 'error', '動作無效');
  end if;
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
      ask_review_note = p_note
  where id = p_question_id;

  if p_action = 'approved' then
    v_pts := admin_qa_user_points(v_q.asker_id, 'ask');
    v_award := admin_qa_points_to_award(v_q.asker_id, v_pts, 50, 'ask');
    if v_award > 0 then
      insert into public.admin_qa_point_events(user_id, user_name, event_type, question_id, points, status, reviewed_at)
      values (v_q.asker_id, v_q.asker_name, 'ask', v_q.id, v_award, 'approved', now());
    end if;
  end if;

  return json_build_object('ok', true, 'status', p_action, 'pointsAwarded', coalesce(v_award, 0));
end;
$$;

create or replace function public.admin_qa_admin_review_answer(
  p_secret text,
  p_answer_id uuid,
  p_action text,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a public.admin_qa_answers%rowtype;
  v_pts int;
  v_award int;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_action not in ('approved', 'rejected') then
    return json_build_object('ok', false, 'error', '動作無效');
  end if;
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
      review_note = p_note
  where id = p_answer_id;

  if p_action = 'approved' then
    v_pts := admin_qa_user_points(v_a.answerer_id, 'answer');
    v_award := admin_qa_points_to_award(v_a.answerer_id, v_pts, 50, 'answer');
    if v_award > 0 then
      insert into public.admin_qa_point_events(user_id, user_name, event_type, question_id, answer_id, points, status, reviewed_at)
      values (v_a.answerer_id, v_a.answerer_name, 'answer', v_a.question_id, v_a.id, v_award, 'approved', now());
    end if;
  end if;

  return json_build_object('ok', true, 'status', p_action, 'pointsAwarded', coalesce(v_award, 0));
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
          asker_name as "askerName",
          created_at as "createdAt"
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
          created_at as "createdAt"
        from public.admin_qa_answers
        where question_id = p_question_id
        order by created_at
      ) t
    ), '[]'::json)
  );
end;
$$;

create or replace function public.admin_qa_admin_delete_question(p_secret text, p_question_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed int;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if not exists (select 1 from public.admin_qa_questions where id = p_question_id) then
    return json_build_object('ok', false, 'error', '找不到問題');
  end if;

  with removed as (
    delete from public.admin_qa_point_events
    where status = 'approved'
      and (
        question_id = p_question_id
        or answer_id in (
          select id from public.admin_qa_answers where question_id = p_question_id
        )
      )
    returning id
  )
  select count(*)::int into v_removed from removed;

  delete from public.admin_qa_questions where id = p_question_id;

  return json_build_object(
    'ok', true,
    'message', '已刪除問題' || case when v_removed > 0 then '，並扣回 ' || v_removed || ' 點' else '' end,
    'pointsRemoved', v_removed
  );
end;
$$;

-- 點數排行榜（總點 = 提問 + 回答）
create or replace function public.admin_qa_leaderboard(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_start timestamptz;
  v_end date;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  v_start := public.admin_qa_period_start();
  v_end := (public.admin_qa_period_end())::date;
  return json_build_object(
    'ok', true,
    'periodFrom', to_char(v_start at time zone 'Asia/Taipei', 'YYYY/MM/DD'),
    'periodTo', to_char(v_end, 'YYYY/MM/DD'),
    'top', coalesce((
      select json_agg(row_to_json(x))
      from (
        select
          row_number() over (order by sum(e.points) desc, max(e.user_name)) as "rank",
          e.user_name as "userName",
          coalesce(max(a.team), '') as "team",
          sum(case when e.event_type = 'ask' then e.points else 0 end)::int as "askPoints",
          sum(case when e.event_type = 'answer' then e.points else 0 end)::int as "answerPoints",
          sum(e.points)::int as "totalPoints",
          count(case when e.event_type = 'ask' then 1 end)::int as "askCount",
          count(case when e.event_type = 'answer' then 1 end)::int as "answerCount"
        from public.admin_qa_point_events e
        left join public.toolbox_accounts a on a.id = e.user_id
        where e.status = 'approved'
          and coalesce(e.reviewed_at, e.created_at) >= v_start
          and coalesce(e.reviewed_at, e.created_at) < v_start + interval '1 month'
        group by e.user_id, e.user_name
        order by sum(e.points) desc, e.user_name
        limit 3
      ) x
    ), '[]'::json)
  );
end;
$$;

-- Google Sheet 匯出用檢視（之後 Apps Script 讀此表或 RPC）
create or replace view public.admin_qa_points_export as
select
  e.id,
  e.user_name as "userName",
  a.username as "username",
  e.event_type as "eventType",
  e.points,
  e.status,
  e.reviewed_at as "reviewedAt",
  e.sheets_exported_at as "sheetsExportedAt",
  e.created_at as "createdAt",
  q.title as "questionTitle"
from public.admin_qa_point_events e
left join public.toolbox_accounts a on a.id = e.user_id
left join public.admin_qa_questions q on q.id = e.question_id
where e.status = 'approved'
order by e.reviewed_at desc nulls last;

-- ========== 後台：所有人點數報表（可篩選日期區間） ==========

create or replace function public.admin_qa_admin_points_report(
  p_secret text,
  p_date_from text default '',
  p_date_to text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if trim(coalesce(p_date_from, '')) <> '' then
    v_from := (trim(p_date_from) || ' 00:00:00+08')::timestamptz;
  end if;
  if trim(coalesce(p_date_to, '')) <> '' then
    v_to := ((trim(p_date_to)::date + 1)::text || ' 00:00:00+08')::timestamptz;
  end if;
  if v_from is not null and v_to is not null and v_from >= v_to then
    return json_build_object('ok', false, 'error', '開始日期不可晚於結束日期');
  end if;
  return json_build_object(
    'ok', true,
    'dateFrom', nullif(trim(coalesce(p_date_from, '')), ''),
    'dateTo', nullif(trim(coalesce(p_date_to, '')), ''),
    'summary', (
      select row_to_json(s) from (
        select
          count(distinct e.user_id)::int as "userCount",
          coalesce(sum(e.points), 0)::int as "totalPoints",
          coalesce(sum(case when e.event_type = 'ask' then e.points else 0 end), 0)::int as "askPoints",
          coalesce(sum(case when e.event_type = 'answer' then e.points else 0 end), 0)::int as "answerPoints",
          count(*)::int as "eventCount"
        from public.admin_qa_point_events e
        where e.status = 'approved'
          and (v_from is null or coalesce(e.reviewed_at, e.created_at) >= v_from)
          and (v_to is null or coalesce(e.reviewed_at, e.created_at) < v_to)
      ) s
    ),
    'rows', coalesce((
      select json_agg(row_to_json(x) order by x."totalPoints" desc, x."userName")
      from (
        select
          row_number() over (order by sum(e.points) desc, e.user_name) as "rank",
          e.user_id as "userId",
          coalesce(max(a.username), '') as "username",
          e.user_name as "userName",
          coalesce(max(a.team), '') as "team",
          sum(case when e.event_type = 'ask' then e.points else 0 end)::int as "askPoints",
          sum(case when e.event_type = 'answer' then e.points else 0 end)::int as "answerPoints",
          sum(e.points)::int as "totalPoints",
          count(case when e.event_type = 'ask' then 1 end)::int as "askCount",
          count(case when e.event_type = 'answer' then 1 end)::int as "answerCount"
        from public.admin_qa_point_events e
        left join public.toolbox_accounts a on a.id = e.user_id
        where e.status = 'approved'
          and (v_from is null or coalesce(e.reviewed_at, e.created_at) >= v_from)
          and (v_to is null or coalesce(e.reviewed_at, e.created_at) < v_to)
        group by e.user_id, e.user_name
        order by sum(e.points) desc, e.user_name
      ) x
    ), '[]'::json)
  );
end;
$$;

-- ========== 帳號後台：QA 雙倍點數開關（toolbox_admin_list 亦需回傳 adminQaDoublePoints） ==========

create or replace function public.toolbox_admin_set_qa_double(
  p_secret text,
  p_user_id uuid,
  p_enabled boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  update public.toolbox_accounts
  set admin_qa_double_points = coalesce(p_enabled, false)
  where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到帳號');
  end if;
  return json_build_object('ok', true, 'enabled', coalesce(p_enabled, false));
end;
$$;

-- Base / award points (quality ×2 applied at review or via set_quality sync)
create or replace function public.admin_qa_base_points(p_user_id uuid, p_event_type text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(p_event_type, 'ask') = 'answer' then return 2; end if;
  return 1;
end;
$$;

create or replace function public.admin_qa_award_points(
  p_user_id uuid,
  p_event_type text,
  p_quality boolean default false
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_pts int;
begin
  v_pts := admin_qa_base_points(p_user_id, p_event_type);
  if coalesce(p_quality, false) then
    v_pts := v_pts * 2;
  end if;
  return v_pts;
end;
$$;

-- Sync point_events when quality is toggled after approval
create or replace function public.admin_qa_sync_quality_points(
  p_kind text,
  p_id uuid,
  p_enabled boolean
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.admin_qa_point_events%rowtype;
  v_new_pts int;
begin
  if p_kind = 'question' then
    select * into v_event
    from public.admin_qa_point_events
    where question_id = p_id and event_type = 'ask' and status = 'approved'
    order by reviewed_at desc nulls last
    limit 1;
  elsif p_kind = 'answer' then
    select * into v_event
    from public.admin_qa_point_events
    where answer_id = p_id and event_type = 'answer' and status = 'approved'
    order by reviewed_at desc nulls last
    limit 1;
  else
    return 0;
  end if;

  if not found then
    return 0;
  end if;

  v_new_pts := admin_qa_award_points(v_event.user_id, v_event.event_type, coalesce(p_enabled, false));
  if v_event.points is distinct from v_new_pts then
    update public.admin_qa_point_events set points = v_new_pts where id = v_event.id;
  end if;
  return v_new_pts;
end;
$$;

create or replace function public.admin_qa_admin_set_quality(
  p_secret text,
  p_kind text,
  p_id uuid,
  p_enabled boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_pts int;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_kind = 'question' then
    update public.admin_qa_questions set is_quality = coalesce(p_enabled, false)
    where id = p_id and ask_review_status = 'approved' returning id into p_id;
    if not found then return json_build_object('ok', false, 'error', '找不到已通過的問題'); end if;
  elsif p_kind = 'answer' then
    update public.admin_qa_answers set is_quality = coalesce(p_enabled, false)
    where id = p_id and review_status = 'approved' returning id into p_id;
    if not found then return json_build_object('ok', false, 'error', '找不到已通過的回答'); end if;
  else
    return json_build_object('ok', false, 'error', '類型無效');
  end if;
  v_pts := admin_qa_sync_quality_points(p_kind, p_id, coalesce(p_enabled, false));
  return json_build_object('ok', true, 'enabled', coalesce(p_enabled, false), 'points', v_pts);
end;
$$;

create or replace function public.admin_qa_admin_set_quality(
  p_secret text,
  p_kind text,
  p_id uuid,
  p_enabled boolean,
  p_token text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_pts int;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if not admin_qa_can_set_quality(admin_qa_user_id(p_token)) then
    return json_build_object('ok', false, 'error', '您沒有優質認定權限');
  end if;
  if p_kind = 'question' then
    update public.admin_qa_questions set is_quality = coalesce(p_enabled, false)
    where id = p_id and ask_review_status = 'approved' returning id into p_id;
    if not found then return json_build_object('ok', false, 'error', '找不到已通過的問題'); end if;
  elsif p_kind = 'answer' then
    update public.admin_qa_answers set is_quality = coalesce(p_enabled, false)
    where id = p_id and review_status = 'approved' returning id into p_id;
    if not found then return json_build_object('ok', false, 'error', '找不到已通過的回答'); end if;
  else
    return json_build_object('ok', false, 'error', '類型無效');
  end if;
  v_pts := admin_qa_sync_quality_points(p_kind, p_id, coalesce(p_enabled, false));
  return json_build_object('ok', true, 'enabled', coalesce(p_enabled, false), 'points', v_pts);
end;
$$;

grant execute on function public.admin_qa_validate_category(text) to anon, authenticated;
grant execute on function public.admin_qa_list(text, text, int, int, text) to anon, authenticated;
grant execute on function public.admin_qa_get(text, uuid) to anon, authenticated;
grant execute on function public.admin_qa_ask(text, text, text, text[], text) to anon, authenticated;
grant execute on function public.admin_qa_answer(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_qa_my_stats(text) to anon, authenticated;
grant execute on function public.admin_qa_admin_pending(text) to anon, authenticated;
grant execute on function public.admin_qa_admin_review_question(text, uuid, text, text) to anon, authenticated;
grant execute on function public.admin_qa_admin_review_answer(text, uuid, text, text) to anon, authenticated;
grant execute on function public.admin_qa_admin_list_questions(text, text, int, int) to anon, authenticated;
grant execute on function public.admin_qa_admin_get_question(text, uuid) to anon, authenticated;
grant execute on function public.admin_qa_admin_delete_question(text, uuid) to anon, authenticated;
grant execute on function public.admin_qa_admin_points_report(text, text, text) to anon, authenticated;
grant execute on function public.admin_qa_leaderboard(text) to anon, authenticated;
grant execute on function public.admin_qa_prepare_upload(text, text) to anon, authenticated;
grant execute on function public.admin_qa_prepare_file_upload(text, text) to anon, authenticated;
grant execute on function public.admin_qa_validate_files(uuid, text[]) to anon, authenticated;
grant execute on function public.admin_qa_ask(text, text, text, text[]) to anon, authenticated;
grant execute on function public.admin_qa_answer(text, uuid, text, text[]) to anon, authenticated;
grant execute on function public.toolbox_admin_set_qa_double(text, uuid, boolean) to anon, authenticated;
