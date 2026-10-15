-- 簽呈 AI 一鍵整理：登入檢查與每日次數上限（AI 服務在呼叫 Cursor 前先呼叫 petition_ai_begin）
-- 需先套用 admin-qa.sql（admin_qa_user_id）

create table if not exists public.petition_ai_usage (
  id bigserial primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  mode text not null default '',
  input_chars integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists petition_ai_usage_user_time on public.petition_ai_usage (user_id, created_at desc);
create index if not exists petition_ai_usage_time on public.petition_ai_usage (created_at desc);
alter table public.petition_ai_usage enable row level security;
revoke all on public.petition_ai_usage from anon, authenticated;

create or replace function public.petition_ai_begin(p_token text, p_mode text, p_chars integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  -- 簽呈、註銷備註、改善計畫各自計次
  v_bucket text := case when p_mode in ('cancel-note', 'plan-polish') then p_mode else 'petition' end;
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
     and (case when mode in ('cancel-note', 'plan-polish') then mode else 'petition' end) = v_bucket;
  if v_used >= v_user_limit then
    return json_build_object('ok', false, 'error', '今天的 AI 整理次數已用完（每人 24 小時內 ' || v_user_limit || ' 次），請稍後再試');
  end if;
  select count(*) into v_total from petition_ai_usage
   where created_at > now() - interval '1 day'
     and (case when mode in ('cancel-note', 'plan-polish') then mode else 'petition' end) = v_bucket;
  if v_total >= v_total_limit then
    return json_build_object('ok', false, 'error', '全公司今天的 AI 整理次數已達上限，請明天再試或自行填寫');
  end if;
  insert into petition_ai_usage (user_id, mode, input_chars)
  values (v_uid, left(coalesce(p_mode, ''), 20), greatest(0, least(coalesce(p_chars, 0), 1000000)));
  return json_build_object('ok', true, 'remaining', v_user_limit - v_used - 1);
end;
$$;

revoke all on function public.petition_ai_begin(text, text, integer) from public;
grant execute on function public.petition_ai_begin(text, text, integer) to anon, authenticated;
