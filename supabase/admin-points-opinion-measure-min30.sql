-- 行政檢討對策至少 30 字（送出／修改）；AI 潤飾 mode=op-measure 併入 plan-polish 計次桶
-- 已於遠端套用；本檔供本地對齊。

create or replace function public.petition_ai_begin(p_token text, p_mode text, p_chars integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_bucket text := case
    when p_mode in ('cancel-note') then 'cancel-note'
    when p_mode in ('plan-polish', 'op-measure', 'med-summary') then 'plan-polish'
    else 'petition'
  end;
  v_user_limit integer := case when v_bucket = 'petition' then 10 else 20 end;
  v_total_limit integer := case when v_bucket = 'petition' then 100 else 300 end;
  v_used integer;
  v_total integer;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select count(*) into v_used from petition_ai_usage
   where user_id = v_uid and created_at > now() - interval '1 day'
     and (case
            when mode in ('cancel-note') then 'cancel-note'
            when mode in ('plan-polish', 'op-measure', 'med-summary') then 'plan-polish'
            else 'petition'
          end) = v_bucket;
  if v_used >= v_user_limit then
    return json_build_object('ok', false, 'error', '今天的 AI 整理次數已用完（每人 24 小時內 ' || v_user_limit || ' 次），請稍後再試');
  end if;
  select count(*) into v_total from petition_ai_usage
   where created_at > now() - interval '1 day'
     and (case
            when mode in ('cancel-note') then 'cancel-note'
            when mode in ('plan-polish', 'op-measure', 'med-summary') then 'plan-polish'
            else 'petition'
          end) = v_bucket;
  if v_total >= v_total_limit then
    return json_build_object('ok', false, 'error', '全公司今天的 AI 整理次數已達上限，請明天再試或自行填寫');
  end if;
  insert into petition_ai_usage (user_id, mode, input_chars)
  values (v_uid, left(coalesce(p_mode, ''), 20), greatest(0, least(coalesce(p_chars, 0), 1000000)));
  return json_build_object('ok', true, 'remaining', v_user_limit - v_used - 1);
end;
$$;
