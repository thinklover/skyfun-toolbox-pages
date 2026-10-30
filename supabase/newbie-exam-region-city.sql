-- 財補考試「地區」改依處別顯示縣市（嘉一處→嘉義）；評分仍對應雙北／桃園／台中台南題庫答案

create or replace function public.newbie_exam_region_for_team(p_team text)
returns text language sql immutable as $$
  select case
    when p_team in ('北一處', '北二處', '北三處') then '台北'
    when p_team = '基一處' then '基隆'
    when p_team = '宜一處' then '宜蘭'
    when p_team = '桃一處' then '桃園'
    when p_team = '竹一處' then '新竹'
    when p_team in ('中一處', '中二處', '中三處', '中四處', '中五處', '中六處') then '台中'
    when p_team = '彰一處' then '彰化'
    when p_team = '嘉一處' then '嘉義'
    when p_team in ('南一處', '南二處') then '台南'
    when p_team in ('高一處', '高二處') then '高雄'
    else null
  end;
$$;

create or replace function public.newbie_exam_score_region(p_region text)
returns text language sql immutable as $$
  select case
    when p_region in ('台北', '新北', '基隆', '宜蘭', '雙北') then '雙北'
    when p_region in ('桃園', '新竹') then '桃園'
    when p_region in ('台中', '彰化', '嘉義', '台南', '高雄', '台中台南') then '台中台南'
    else null
  end;
$$;

create or replace function public.newbie_exam_start(p_token text, p_region text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_region text; v_row public.newbie_exam_attempts%rowtype; v_last text;
  v_ok_cities text[] := array['台北','新北','基隆','宜蘭','桃園','新竹','台中','彰化','嘉義','台南','高雄','雙北','台中台南'];
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
    if v_region is null or not (v_region = any (v_ok_cities)) or newbie_exam_score_region(v_region) is null then
      return json_build_object('ok', false, 'needRegion', true, 'team', coalesce(v_acc.team, ''),
        'error', '請先選擇作答地區');
    end if;
  end if;

  update public.newbie_exam_attempts set status = 'abandoned'
  where user_id = v_uid and status = 'in_progress';

  select paper into v_last from public.newbie_exam_attempts
  where user_id = v_uid order by started_at desc limit 1;

  insert into public.newbie_exam_attempts (user_id, username, user_name, team, paper, region, deadline_at)
  values (v_uid, v_acc.username, coalesce(nullif(v_acc.name, ''), v_acc.username), coalesce(v_acc.team, ''),
    case v_last when 'A' then 'B' when 'B' then 'A' else case when random() < 0.5 then 'A' else 'B' end end,
    v_region, now() + interval '20 minutes')
  returning * into v_row;

  return json_build_object('ok', true, 'resumed', false, 'attemptId', v_row.id, 'paper', v_row.paper,
    'region', v_row.region, 'startedAt', v_row.started_at, 'deadlineAt', v_row.deadline_at, 'serverNow', now());
end; $$;

create or replace function public.newbie_exam_submit(p_token text, p_attempt_id bigint, p_answers jsonb, p_auto boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_row public.newbie_exam_attempts%rowtype; k record;
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_given jsonb; v_correct jsonb; v_text text; v_norm text;
  v_earned numeric; v_total numeric := 0; v_hit int; v_need int; g text;
  v_results jsonb := '{}'::jsonb; v_sections jsonb := '{}'::jsonb; v_sec jsonb;
  v_score_region text;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_row from public.newbie_exam_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'error', '找不到這份考卷'); end if;
  if v_row.status <> 'in_progress' then return json_build_object('ok', false, 'error', '這份考卷已交卷或已作廢'); end if;

  v_score_region := coalesce(newbie_exam_score_region(v_row.region), v_row.region);

  for k in select * from public.newbie_exam_keys where paper = v_row.paper order by qid loop
    v_given := v_answers -> k.qid;
    v_earned := 0;
    v_correct := null;
    if k.qtype in ('tf', 'single') then
      v_correct := k.answer -> 'v';
      if v_given is not null and jsonb_typeof(v_given) = 'string' and v_given = v_correct then v_earned := k.points; end if;
    elsif k.qtype = 'multi' then
      v_correct := coalesce(k.answer -> 'v', k.answer -> 'regions' -> v_score_region);
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

update public.newbie_exam_attempts a
set region = public.newbie_exam_region_for_team(a.team)
where public.newbie_exam_region_for_team(a.team) is not null
  and a.region is distinct from public.newbie_exam_region_for_team(a.team);

revoke all on function public.newbie_exam_score_region(text) from public, anon, authenticated;
