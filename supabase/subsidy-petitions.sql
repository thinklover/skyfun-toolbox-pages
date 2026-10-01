-- 財補展延簽呈上傳
-- 檔案存在私有 bucket subsidy-checkin 的 petitions/ 底下，只能透過 Edge Function subsidy-checkin（service role）存取。

create table if not exists public.subsidy_petitions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  username text not null default '',
  user_name text not null default '',
  team text not null default '',
  note text not null default '',
  file_path text not null,
  file_name text not null default '',
  mime text not null default '',
  size_bytes integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists subsidy_petitions_created_idx on public.subsidy_petitions (created_at);
create index if not exists subsidy_petitions_user_idx on public.subsidy_petitions (user_id);

alter table public.subsidy_petitions enable row level security;
revoke all on public.subsidy_petitions from anon, authenticated;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'subsidy-checkin';
