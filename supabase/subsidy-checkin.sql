-- 財補計畫每日打卡照片上傳
-- 照片存在私有 bucket subsidy-checkin，只能透過 Edge Function subsidy-checkin（service role）存取。

create table if not exists public.subsidy_checkins (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  username text not null default '',
  user_name text not null default '',
  team text not null default '',
  day date not null,
  note text not null default '',
  photo_path text,
  thumb_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists subsidy_checkins_day_idx on public.subsidy_checkins (day);

alter table public.subsidy_checkins enable row level security;
revoke all on public.subsidy_checkins from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subsidy-checkin', 'subsidy-checkin', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
