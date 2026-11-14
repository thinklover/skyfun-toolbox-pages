-- AI婷婷 問答：問題佇列（工具箱 → Grok webhook → 回寫答案）
-- 在 Supabase SQL Editor 執行

create table if not exists public.ai_tingting_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  user_name text not null default '',
  zone text not null check (zone in ('admin', 'supervisor')),
  question text not null,
  answer text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'answered', 'failed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists ai_tingting_questions_user_created_idx
  on public.ai_tingting_questions (user_id, created_at desc);

create index if not exists ai_tingting_questions_status_idx
  on public.ai_tingting_questions (status, created_at desc);

alter table public.ai_tingting_questions enable row level security;

revoke all on public.ai_tingting_questions from anon, authenticated;

-- 阻擋前端直接改 answer／status；讀寫一律走 Edge Function（service role）
create policy ai_tingting_no_direct_select
  on public.ai_tingting_questions
  for select
  to authenticated
  using (false);

create policy ai_tingting_no_direct_insert
  on public.ai_tingting_questions
  for insert
  to authenticated
  with check (false);

create policy ai_tingting_no_direct_update
  on public.ai_tingting_questions
  for update
  to authenticated
  using (false);

create policy ai_tingting_no_direct_delete
  on public.ai_tingting_questions
  for delete
  to authenticated
  using (false);

comment on table public.ai_tingting_questions is
  'AI婷婷問答佇列；客戶端僅能透過 Edge Function ask/get/list/answer 存取';
;