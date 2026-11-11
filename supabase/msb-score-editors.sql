-- 會議計分：加減分改由名單決定。總經理室在設定頁勾選。
-- 第一次建立時，把目前職稱規則可編輯的在職帳號先放進名單，避免一次全關掉。

create table if not exists public.msb_score_editors (
  account_id uuid primary key references public.toolbox_accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.msb_score_editors enable row level security;
revoke all on public.msb_score_editors from public, anon, authenticated;

insert into public.msb_score_editors (account_id)
select a.id
from public.toolbox_accounts a
where a.status = 'active'
  and public.msb_can_edit(trim(coalesce(a.team, '')), trim(coalesce(a.job_title, '')))
on conflict (account_id) do nothing;

create or replace function public.msb_actor(
  p_uid uuid,
  out o_team text,
  out o_title text,
  out o_name text,
  out o_can_all boolean,
  out o_can_edit boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  select trim(coalesce(a.team, '')), trim(coalesce(a.job_title, '')), trim(coalesce(nullif(a.name, ''), a.username, ''))
    into o_team, o_title, o_name
  from public.toolbox_accounts a
  where a.id = p_uid and a.status = 'active';
  o_can_all := public.msb_can_view_all(o_team, o_title);
  o_can_edit := exists (
    select 1 from public.msb_score_editors e where e.account_id = p_uid
  );
end;
$$;

revoke all on function public.msb_actor(uuid) from public, anon, authenticated;

create or replace function public.msb_can_manage_editors(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.toolbox_accounts a
    where a.id = p_uid
      and a.status = 'active'
      and trim(coalesce(a.team, '')) = '總經理室'
      and trim(coalesce(a.job_title, '')) <> '工讀生'
  );
$$;

revoke all on function public.msb_can_manage_editors(uuid) from public, anon, authenticated;

create or replace function public.msb_editors_list(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
begin
  if not public.msb_can_manage_editors(v_uid) then
    return json_build_object('ok', false, 'error', '只有總經理室可以設定加減分權限');
  end if;
  return json_build_object(
    'ok', true,
    'accounts', coalesce((
      select json_agg(row_to_json(x) order by x.on desc, x.team, x.name)
      from (
        select
          a.id,
          trim(coalesce(nullif(a.name, ''), '未命名')) as name,
          trim(coalesce(a.team, '')) as team,
          trim(coalesce(a.job_title, '')) as title,
          (e.account_id is not null) as on
        from public.toolbox_accounts a
        left join public.msb_score_editors e on e.account_id = a.id
        where a.status = 'active'
      ) x
    ), '[]'::json)
  );
end;
$$;

create or replace function public.msb_editors_set(p_token text, p_account_id uuid, p_on boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
begin
  if not public.msb_can_manage_editors(v_uid) then
    return json_build_object('ok', false, 'error', '只有總經理室可以設定加減分權限');
  end if;
  if p_account_id is null or not exists (
    select 1 from public.toolbox_accounts a where a.id = p_account_id and a.status = 'active'
  ) then
    return json_build_object('ok', false, 'error', '找不到這個帳號');
  end if;
  if coalesce(p_on, false) then
    insert into public.msb_score_editors (account_id) values (p_account_id)
    on conflict (account_id) do nothing;
  else
    delete from public.msb_score_editors where account_id = p_account_id;
  end if;
  return json_build_object('ok', true, 'on', coalesce(p_on, false));
end;
$$;

grant execute on function public.msb_editors_list(text) to anon, authenticated;
grant execute on function public.msb_editors_set(text, uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
