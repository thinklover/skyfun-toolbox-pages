-- 財補專區線上考試（星鴻財補計畫試題 1140529 版 A/B 卷）
-- 答案只存在 newbie_exam_keys，前端無法讀取；由 newbie_exam_submit 於伺服器端評分。

create table if not exists public.newbie_exam_keys (
  paper text not null,
  qid text not null,
  qtype text not null check (qtype in ('tf', 'single', 'multi', 'short')),
  points numeric not null,
  answer jsonb not null,
  primary key (paper, qid)
);
alter table public.newbie_exam_keys enable row level security;
revoke all on public.newbie_exam_keys from anon, authenticated;

create table if not exists public.newbie_exam_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  username text not null default '',
  user_name text not null default '',
  team text not null default '',
  paper text not null,
  region text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'abandoned')),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  duration_sec int,
  auto_submitted boolean not null default false,
  overtime boolean not null default false,
  score numeric(5,1),
  section_scores jsonb,
  answers jsonb,
  results jsonb
);
create index if not exists newbie_exam_attempts_user_idx on public.newbie_exam_attempts (user_id, started_at desc);
create index if not exists newbie_exam_attempts_started_idx on public.newbie_exam_attempts (started_at desc);
alter table public.newbie_exam_attempts enable row level security;
revoke all on public.newbie_exam_attempts from anon, authenticated;

-- 答案 ------------------------------------------------------------------------
delete from public.newbie_exam_keys;

insert into public.newbie_exam_keys (paper, qid, qtype, points, answer)
select 'A', 'tf' || n, 'tf', 2, jsonb_build_object('v', case when n in (11, 15) then '1' else '2' end)
from generate_series(1, 30) n;

insert into public.newbie_exam_keys (paper, qid, qtype, points, answer)
select 'B', 'tf' || n, 'tf', 2,
  jsonb_build_object('v', case when n in (1, 8, 11, 12, 14, 17, 18, 19, 22, 23, 30) then '1' else '2' end)
from generate_series(1, 30) n;

insert into public.newbie_exam_keys (paper, qid, qtype, points, answer) values
  ('A', 's1', 'single', 3, '{"v":"4"}'),
  ('A', 's2', 'single', 3, '{"v":"3"}'),
  ('A', 's3', 'single', 3, '{"v":"4"}'),
  ('A', 's4', 'single', 3, '{"v":"4"}'),
  ('A', 's5', 'single', 3, '{"v":"4"}'),
  ('B', 's1', 'single', 3, '{"v":"4"}'),
  ('B', 's2', 'single', 3, '{"v":"4"}'),
  ('B', 's3', 'single', 3, '{"v":"1"}'),
  ('B', 's4', 'single', 3, '{"v":"4"}'),
  ('B', 's5', 'single', 3, '{"v":"4"}'),
  ('A', 'm1', 'multi', 5, '{"v":["1","3","5","6"]}'),
  ('A', 'm2', 'multi', 5, '{"regions":{"雙北":["2","3"],"桃園":["2","3","4"],"台中台南":["3","5"]}}'),
  ('A', 'm3', 'multi', 5, '{"v":["1","4"]}'),
  ('B', 'm1', 'multi', 5, '{"v":["4","6"]}'),
  ('B', 'm2', 'multi', 5, '{"regions":{"雙北":["3","4"],"桃園":["2","3","4"],"台中台南":["1","3"]}}'),
  ('B', 'm3', 'multi', 5, '{"v":["3","4"]}');

-- 簡答：groups 為關鍵字正規式（任一符合即得該組分），得分＝min(符合組數, need)/need × 配分
insert into public.newbie_exam_keys (paper, qid, qtype, points, answer) values
  ('A', 'q1', 'short', 1, '{"ref":"人工登記謄本","groups":["人工"],"need":1}'),
  ('A', 'q2', 'short', 1, '{"ref":"ABC（a登記日期 → b登記原因發生日期 → c收件日期）","exact":"ABC"}'),
  ('A', 'q3', 'short', 1, '{"ref":"使用執照、課稅明細起課年月","groups":["使用執照|使照","課稅明細|起課"],"need":2}'),
  ('A', 'q4', 'short', 1, '{"ref":"大門、門牌、衛浴設備、出入口、上下樓梯、偵煙器、滅火器、熱水器","groups":["大門","門牌","衛浴","出入口","樓梯","偵煙|煙霧|火災警報|住警器","滅火器","熱水器"],"need":8}'),
  ('A', 'q5', 'short', 1, '{"ref":"租賃契約變更申請書","groups":["變更申請書|契約變更"],"need":1}'),
  ('A', 'q6', 'short', 1, '{"ref":"確認租期是否已到期，若未到期請確認租期有無重疊；1.將租期錯開 2.請房客進行解約，並解約完成才可簽約","groups":["到期","重疊","錯開","解約"],"need":4}'),
  ('A', 'q7', 'short', 1, '{"ref":"印鑑證明、代理人授權書","groups":["印鑑證明","授權書"],"need":2}'),
  ('A', 'q8', 'short', 1, '{"ref":"六個月繳租、信任租、保險","groups":["六個月|6個月|半年","信任租","保險"],"need":3}'),
  ('A', 'q9', 'short', 1, '{"ref":"火災、地震、跌價","groups":["火災|火險","地震","跌價"],"need":3}'),
  ('A', 'q10', 'short', 1, '{"ref":"修繕前中後照片、發票或收據","groups":["照片|相片","發票|收據"],"need":2}'),
  ('B', 'q1', 'short', 1, '{"ref":"人工登記謄本","groups":["人工"],"need":1}'),
  ('B', 'q2', 'short', 1, '{"ref":"ABC（a登記日期 → b登記原因發生日期 → c收件日期）","exact":"ABC"}'),
  ('B', 'q3', 'short', 1, '{"ref":"使用執照、課稅明細起課年月","groups":["使用執照|使照","課稅明細|起課"],"need":2}'),
  ('B', 'q4', 'short', 1, '{"ref":"大門、門牌、衛浴設備、出入口、上下樓梯、偵煙器、滅火器、熱水器","groups":["大門","門牌","衛浴","出入口","樓梯","偵煙|煙霧|火災警報|住警器","滅火器","熱水器"],"need":8}'),
  ('B', 'q5', 'short', 1, '{"ref":"身心障礙、中低收入戶、低收入戶、特殊境遇家庭、受家庭暴力或性侵害之受害者及其子女（至少三項）","groups":["身心障礙|身障","中低收入","(^|[^中])低收入","特殊境遇","家暴|家庭暴力|性侵"],"need":3}'),
  ('B', 'q6', 'short', 1, '{"ref":"113/10/11","groups":["(113[年/.-]?)?10[月/.-]11"],"need":1}'),
  ('B', 'q7', 'short', 1, '{"ref":"印鑑證明、代理人授權書","groups":["印鑑證明","授權書"],"need":2}'),
  ('B', 'q8', 'short', 1, '{"ref":"六個月繳租、信任租、保險","groups":["六個月|6個月|半年","信任租","保險"],"need":3}'),
  ('B', 'q9', 'short', 1, '{"ref":"火災、地震、跌價","groups":["火災|火險","地震","跌價"],"need":3}'),
  ('B', 'q10', 'short', 1, '{"ref":"保險單、保險費收據、繳款證明","groups":["保險單|保單","收據","繳款證明|繳費證明|付款證明"],"need":3}');

-- 工具函式 ----------------------------------------------------------------------
create or replace function public.newbie_exam_region_for_team(p_team text)
returns text language sql immutable as $$
  select case
    when p_team in ('北一處', '北二處', '北三處', '基一處', '宜一處') then '雙北'
    when p_team in ('桃一處', '竹一處') then '桃園'
    when p_team ~ '^(中[一二三四五六]|彰一|嘉一|南[一二]|高[一二])處$' then '台中台南'
    else null
  end;
$$;

create or replace function public.newbie_exam_norm(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(
    translate(coalesce(p, ''), '０１２３４５６７８９／．－ＡＢＣａｂｃ，、', '0123456789/.-ABCabc,,'),
    '\s', '', 'g'));
$$;

-- 開始考試（有未過期的進行中考卷則續考）
create or replace function public.newbie_exam_start(p_token text, p_region text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_region text; v_row public.newbie_exam_attempts%rowtype;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;

  select * into v_row from public.newbie_exam_attempts
  where user_id = v_uid and status = 'in_progress' and deadline_at > now()
  order by started_at desc limit 1;
  if found then
    return json_build_object('ok', true, 'resumed', true, 'attemptId', v_row.id, 'paper', v_row.paper,
      'region', v_row.region, 'startedAt', v_row.started_at, 'deadlineAt', v_row.deadline_at, 'serverNow', now());
  end if;

  v_region := newbie_exam_region_for_team(coalesce(v_acc.team, ''));
  if v_region is null then
    v_region := nullif(trim(coalesce(p_region, '')), '');
    if v_region is null or v_region not in ('雙北', '桃園', '台中台南') then
      return json_build_object('ok', false, 'needRegion', true, 'team', coalesce(v_acc.team, ''),
        'error', '請先選擇作答地區');
    end if;
  end if;

  update public.newbie_exam_attempts set status = 'abandoned'
  where user_id = v_uid and status = 'in_progress';

  insert into public.newbie_exam_attempts (user_id, username, user_name, team, paper, region, deadline_at)
  values (v_uid, v_acc.username, coalesce(nullif(v_acc.name, ''), v_acc.username), coalesce(v_acc.team, ''),
    case when random() < 0.5 then 'A' else 'B' end, v_region, now() + interval '20 minutes')
  returning * into v_row;

  return json_build_object('ok', true, 'resumed', false, 'attemptId', v_row.id, 'paper', v_row.paper,
    'region', v_row.region, 'startedAt', v_row.started_at, 'deadlineAt', v_row.deadline_at, 'serverNow', now());
end; $$;

-- 交卷與評分
create or replace function public.newbie_exam_submit(p_token text, p_attempt_id bigint, p_answers jsonb, p_auto boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_row public.newbie_exam_attempts%rowtype; k record;
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_given jsonb; v_correct jsonb; v_text text; v_norm text;
  v_earned numeric; v_total numeric := 0; v_hit int; v_need int; g text;
  v_results jsonb := '{}'::jsonb; v_sections jsonb := '{}'::jsonb; v_sec jsonb;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_row from public.newbie_exam_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'error', '找不到這份考卷'); end if;
  if v_row.status <> 'in_progress' then return json_build_object('ok', false, 'error', '這份考卷已交卷或已作廢'); end if;

  for k in select * from public.newbie_exam_keys where paper = v_row.paper order by qid loop
    v_given := v_answers -> k.qid;
    v_earned := 0;
    v_correct := null;
    if k.qtype in ('tf', 'single') then
      v_correct := k.answer -> 'v';
      if v_given is not null and jsonb_typeof(v_given) = 'string' and v_given = v_correct then v_earned := k.points; end if;
    elsif k.qtype = 'multi' then
      v_correct := coalesce(k.answer -> 'v', k.answer -> 'regions' -> v_row.region);
      if v_given is not null and jsonb_typeof(v_given) = 'array'
        and (select coalesce(array_agg(x order by x), '{}') from (select distinct jsonb_array_elements_text(v_given) x) s)
          = (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(v_correct) x) then
        v_earned := k.points;
      end if;
    else
      v_text := case when v_given is not null and jsonb_typeof(v_given) = 'string' then v_given #>> '{}' else '' end;
      v_norm := newbie_exam_norm(v_text);
      if k.answer ? 'exact' then
        if regexp_replace(v_norm, '[^A-Z]', '', 'g') = k.answer ->> 'exact' then v_earned := k.points; end if;
      elsif v_norm <> '' then
        v_hit := 0;
        for g in select jsonb_array_elements_text(k.answer -> 'groups') loop
          if v_norm ~ g then v_hit := v_hit + 1; end if;
        end loop;
        v_need := greatest(coalesce((k.answer ->> 'need')::int, 1), 1);
        v_earned := round(least(v_hit, v_need)::numeric / v_need * k.points, 2);
      end if;
      v_correct := to_jsonb(k.answer ->> 'ref');
    end if;

    v_total := v_total + v_earned;
    v_results := v_results || jsonb_build_object(k.qid, jsonb_build_object(
      'earned', v_earned, 'points', k.points, 'given', v_given, 'correct', v_correct));
    v_sec := coalesce(v_sections -> k.qtype, '{"earned":0,"max":0}'::jsonb);
    v_sections := v_sections || jsonb_build_object(k.qtype, jsonb_build_object(
      'earned', (v_sec ->> 'earned')::numeric + v_earned, 'max', (v_sec ->> 'max')::numeric + k.points));
  end loop;

  update public.newbie_exam_attempts set
    status = 'submitted',
    submitted_at = now(),
    duration_sec = greatest(0, extract(epoch from (now() - started_at))::int),
    auto_submitted = coalesce(p_auto, false),
    overtime = now() > deadline_at + interval '90 seconds',
    score = round(v_total, 1),
    section_scores = v_sections,
    answers = v_answers,
    results = v_results
  where id = v_row.id
  returning * into v_row;

  return json_build_object('ok', true, 'attemptId', v_row.id, 'paper', v_row.paper, 'region', v_row.region,
    'score', v_row.score, 'sections', v_row.section_scores, 'results', v_row.results,
    'durationSec', v_row.duration_sec, 'overtime', v_row.overtime, 'autoSubmitted', v_row.auto_submitted);
end; $$;

-- 考生：自己的歷次成績
create or replace function public.newbie_exam_my_attempts(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  return json_build_object('ok', true, 'items', coalesce((select json_agg(row_to_json(x)) from (
    select id, paper, region, status, score, started_at as "startedAt", submitted_at as "submittedAt",
      duration_sec as "durationSec", auto_submitted as "autoSubmitted", overtime
    from public.newbie_exam_attempts where user_id = v_uid and status <> 'in_progress'
    order by started_at desc limit 30
  ) x), '[]'::json));
end; $$;

-- 管理員：全部成績（後台密碼）
create or replace function public.newbie_exam_admin_list(p_secret text, p_query text default '', p_limit int default 300)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_q text := trim(coalesce(p_query, ''));
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true, 'items', coalesce((select json_agg(row_to_json(x)) from (
    select id, username, user_name as "userName", team, paper, region, status, score,
      section_scores as "sections", started_at as "startedAt", submitted_at as "submittedAt",
      duration_sec as "durationSec", auto_submitted as "autoSubmitted", overtime
    from public.newbie_exam_attempts
    where v_q = '' or user_name ilike '%' || v_q || '%' or username ilike '%' || v_q || '%' or team ilike '%' || v_q || '%'
    order by started_at desc limit greatest(1, least(coalesce(p_limit, 300), 1000))
  ) x), '[]'::json));
end; $$;

create or replace function public.newbie_exam_admin_get(p_secret text, p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_row public.newbie_exam_attempts%rowtype;
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  select * into v_row from public.newbie_exam_attempts where id = p_id;
  if not found then return json_build_object('ok', false, 'error', '找不到紀錄'); end if;
  return json_build_object('ok', true, 'item', json_build_object(
    'id', v_row.id, 'userName', v_row.user_name, 'username', v_row.username, 'team', v_row.team,
    'paper', v_row.paper, 'region', v_row.region, 'status', v_row.status, 'score', v_row.score,
    'sections', v_row.section_scores, 'answers', v_row.answers, 'results', v_row.results,
    'startedAt', v_row.started_at, 'submittedAt', v_row.submitted_at, 'durationSec', v_row.duration_sec,
    'autoSubmitted', v_row.auto_submitted, 'overtime', v_row.overtime));
end; $$;

revoke all on function public.newbie_exam_region_for_team(text) from public, anon, authenticated;
revoke all on function public.newbie_exam_norm(text) from public, anon, authenticated;
grant execute on function public.newbie_exam_start(text, text) to anon, authenticated;
grant execute on function public.newbie_exam_submit(text, bigint, jsonb, boolean) to anon, authenticated;
grant execute on function public.newbie_exam_my_attempts(text) to anon, authenticated;
grant execute on function public.newbie_exam_admin_list(text, text, int) to anon, authenticated;
grant execute on function public.newbie_exam_admin_get(text, bigint) to anon, authenticated;
