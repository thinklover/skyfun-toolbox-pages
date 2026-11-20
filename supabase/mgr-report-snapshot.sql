-- 社宅管報：契約查詢匯入的快照。不含電話、房東、房客姓名。
-- 直接表權限關閉，只讓已登入且可進業務主管專區的人經 RPC 讀取。

create table if not exists public.mgr_report_contracts (
  id text primary key,
  n text not null default '',
  st text not null default '',
  ct text not null default '',
  ft text not null default '',
  sl text not null default '',
  so text not null default '',
  city text not null default '',
  ls text not null default '',
  le text not null default '',
  ad text not null default '',
  p text not null default '',
  i text not null default '',
  h text not null default '',
  src text not null default '',
  nl text not null default '',
  addr text not null default ''
);

alter table public.mgr_report_contracts enable row level security;
revoke all on public.mgr_report_contracts from public, anon, authenticated;

create table if not exists public.mgr_report_import (
  id int primary key check (id = 1),
  imported_at timestamptz not null default now(),
  n int not null default 0,
  source text not null default ''
);

alter table public.mgr_report_import enable row level security;
revoke all on public.mgr_report_import from public, anon, authenticated;

create table if not exists public.mgr_report_allow (
  name text primary key
);

alter table public.mgr_report_allow enable row level security;
revoke all on public.mgr_report_allow from public, anon, authenticated;

insert into public.mgr_report_allow (name) values
  (convert_from(decode('e7b0a1e782bae580a2', 'hex'), 'UTF8')),
  (convert_from(decode('e982b1e5a595e6a38b', 'hex'), 'UTF8')),
  (convert_from(decode('e9bb83e680a1e5a9b7', 'hex'), 'UTF8'))
on conflict (name) do nothing;

create or replace function public.mgr_report_snapshot(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_team text;
  v_title text;
  v_name text;
  v_at timestamptz;
  v_n int;
  v_source text;
  v_rows json;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select trim(coalesce(a.team, '')), trim(coalesce(a.job_title, '')), trim(coalesce(a.name, ''))
    into v_team, v_title, v_name
  from public.toolbox_accounts a
  where a.id = v_uid and a.status = 'active';
  if v_title = '工讀生' then
    return json_build_object('ok', false, 'error', '業務主管專區僅限儲備處經理以上使用。');
  end if;
  if not (
    exists (select 1 from public.mgr_report_allow w where w.name = v_name)
    or v_team = '總經理室'
    or v_title in ('儲備處經理', '儲備營業處經理', '營業處經理', '營業區協理', '區協理')
  ) then
    return json_build_object('ok', false, 'error', '業務主管專區僅限儲備處經理以上使用。');
  end if;

  select imported_at, n, source into v_at, v_n, v_source
  from public.mgr_report_import where id = 1;

  select coalesce(json_agg(json_build_object(
    'id', c.id,
    'n', c.n,
    'st', c.st,
    'ct', c.ct,
    'ft', c.ft,
    'sl', c.sl,
    'so', c.so,
    'city', c.city,
    'ls', c.ls,
    'le', c.le,
    'ad', c.ad,
    'p', c.p,
    'i', c.i,
    'h', c.h,
    'src', c.src,
    'nl', c.nl,
    'addr', c.addr
  ) order by c.ls, c.id), '[]'::json)
    into v_rows
  from public.mgr_report_contracts c;

  return json_build_object(
    'ok', true,
    'fetchedAt', v_at,
    'n', coalesce(v_n, 0),
    'source', coalesce(v_source, ''),
    'rows', v_rows
  );
end;
$$;

revoke all on function public.mgr_report_snapshot(text) from public;
grant execute on function public.mgr_report_snapshot(text) to anon, authenticated;
