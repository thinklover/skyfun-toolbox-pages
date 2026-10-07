-- 行政專區：簽呈簽核
-- 承辦人電子簽 → 部門主管電子簽 → 經理／協理電子簽 → 總經理室會辦 → 總經理紙本決行
-- manager 欄位代表部門主管、director 代表審核人、gm 代表總經理室會辦人員

create table if not exists public.petitions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  user_name text not null default '',
  team text not null default '',
  title text not null,
  note text not null default '',
  content jsonb not null default '{}'::jsonb,
  manager_id uuid references public.toolbox_accounts(id) on delete set null,
  manager_name text not null default '',
  director_id uuid references public.toolbox_accounts(id) on delete set null,
  director_name text not null default '',
  gm_id uuid references public.toolbox_accounts(id) on delete set null,
  gm_name text not null default '',
  stage text not null default 'manager' check (stage in ('manager', 'director', 'office', 'gm', 'done', 'rejected')),
  round int not null default 1,
  reject_reason text not null default '',
  rejected_by_name text not null default '',
  rejected_stage text not null default '',
  line_error text not null default '',
  line_notified_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists petitions_user_idx on public.petitions (user_id, created_at desc);
create index if not exists petitions_manager_idx on public.petitions (manager_id, stage);
create index if not exists petitions_director_idx on public.petitions (director_id, stage);
create index if not exists petitions_gm_idx on public.petitions (gm_id, stage);
create index if not exists petitions_created_idx on public.petitions (created_at desc);
alter table public.petitions enable row level security;
revoke all on public.petitions from anon, authenticated;

create table if not exists public.petition_files (
  id bigint generated always as identity primary key,
  petition_id bigint not null references public.petitions(id) on delete cascade,
  round int not null default 1,
  stage text not null check (stage in ('applicant', 'manager', 'director', 'gm')),
  user_id uuid references public.toolbox_accounts(id) on delete set null,
  user_name text not null default '',
  file_path text not null,
  file_name text not null,
  mime text not null,
  size_bytes int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists petition_files_petition_idx on public.petition_files (petition_id, created_at);
alter table public.petition_files enable row level security;
revoke all on public.petition_files from anon, authenticated;

create table if not exists public.petition_events (
  id bigint generated always as identity primary key,
  petition_id bigint not null references public.petitions(id) on delete cascade,
  actor_id uuid references public.toolbox_accounts(id) on delete set null,
  actor_name text not null default '',
  action text not null check (action in ('submit', 'approve', 'reject', 'resubmit', 'withdraw')),
  stage text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists petition_events_petition_idx on public.petition_events (petition_id, created_at);
alter table public.petition_events enable row level security;
revoke all on public.petition_events from anon, authenticated;

create table if not exists public.petition_signatures (
  id bigint generated always as identity primary key,
  petition_id bigint not null references public.petitions(id) on delete cascade,
  round int not null default 1,
  role text not null check (role in ('applicant', 'manager', 'director')),
  user_id uuid references public.toolbox_accounts(id) on delete set null,
  user_name text not null default '',
  file_path text not null,
  created_at timestamptz not null default now(),
  unique (petition_id, round, role)
);
create index if not exists petition_signatures_petition_idx on public.petition_signatures (petition_id, round);
alter table public.petition_signatures enable row level security;
revoke all on public.petition_signatures from anon, authenticated;

create table if not exists public.petition_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
-- manager_ids / director_ids / office_ids：後台勾選的主管、審核、總經理室會辦人員 UUID JSON 陣列
alter table public.petition_settings enable row level security;
revoke all on public.petition_settings from anon, authenticated;

-- 已建立舊版資料表時，補上總經理室會辦階段。
alter table public.petitions drop constraint if exists petitions_stage_check;
alter table public.petitions add constraint petitions_stage_check
  check (stage in ('manager', 'director', 'office', 'gm', 'done', 'rejected'));
alter table public.petitions add column if not exists content jsonb not null default '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('petitions', 'petitions', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
