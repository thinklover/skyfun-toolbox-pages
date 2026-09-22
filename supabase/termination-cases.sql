-- 轉租解約暫存：綁定 toolbox 帳號，電腦／手機同一帳號可讀寫刪
-- 在 Supabase SQL Editor 執行（需已有 toolbox_accounts / toolbox_sessions）

create table if not exists public.termination_cases (
  owner_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  id text not null,
  tenant_name text not null default '',
  address text not null default '',
  match_no text,
  status text not null default 'draft' check (status in ('draft', 'handover', 'done')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create index if not exists termination_cases_owner_updated_idx
  on public.termination_cases (owner_id, updated_at desc);

alter table public.termination_cases enable row level security;
revoke all on public.termination_cases from anon, authenticated;

create or replace function public.termination_case_uid(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid;
begin
  select s.user_id into v_uid
  from public.toolbox_sessions s
  join public.toolbox_accounts a on a.id = s.user_id
  where s.token = trim(coalesce(p_token, ''))
    and s.expires_at >= now()
    and a.status = 'active';
  return v_uid;
end;
$$;

create or replace function public.termination_case_list(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := public.termination_case_uid(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  return json_build_object(
    'ok', true,
    'cases', coalesce((
      select json_agg(x.obj order by x.updated_at desc)
      from (
        select
          c.updated_at,
          (c.payload || jsonb_build_object(
            'id', c.id,
            'tenantName', c.tenant_name,
            'address', c.address,
            'matchNo', c.match_no,
            'status', c.status,
            'createdAt', c.created_at,
            'updatedAt', c.updated_at,
            'ownerUserId', c.owner_id
          )) as obj
        from public.termination_cases c
        where c.owner_id = v_uid
      ) x
    ), '[]'::json)
  );
end;
$$;

create or replace function public.termination_case_upsert(p_token text, p_case jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_id text;
  v_name text;
  v_addr text;
  v_match text;
  v_status text;
  v_payload jsonb;
  v_created timestamptz;
  v_cnt int;
begin
  v_uid := public.termination_case_uid(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  if p_case is null or p_case = '{}'::jsonb then
    return json_build_object('ok', false, 'error', '沒有可暫存的資料');
  end if;

  v_id := nullif(trim(coalesce(p_case->>'id', '')), '');
  if v_id is null then
    v_id := 'tc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18);
  end if;
  if length(v_id) > 80 then
    return json_build_object('ok', false, 'error', '暫存編號無效');
  end if;

  v_name := left(trim(coalesce(p_case->>'tenantName', '')), 80);
  v_addr := left(trim(coalesce(p_case->>'address', '')), 200);
  if v_name = '' and v_addr = '' then
    return json_build_object('ok', false, 'error', '請至少填房客姓名或租賃地址');
  end if;
  v_match := left(trim(coalesce(p_case->>'matchNo', '')), 80);
  v_status := trim(coalesce(p_case->>'status', 'draft'));
  if v_status not in ('draft', 'handover', 'done') then
    v_status := 'draft';
  end if;

  select count(*)::int into v_cnt
  from public.termination_cases
  where owner_id = v_uid;
  if v_cnt >= 80 and not exists (
    select 1 from public.termination_cases where owner_id = v_uid and id = v_id
  ) then
    return json_build_object('ok', false, 'error', '暫存已滿（最多 80 筆），請先刪除舊的');
  end if;

  v_payload := coalesce(p_case, '{}'::jsonb) || jsonb_build_object(
    'id', v_id,
    'tenantName', v_name,
    'address', v_addr,
    'matchNo', v_match,
    'status', v_status,
    'ownerUserId', v_uid
  );

  begin
    v_created := nullif(trim(coalesce(p_case->>'createdAt', '')), '')::timestamptz;
  exception when others then
    v_created := null;
  end;

  insert into public.termination_cases (
    owner_id, id, tenant_name, address, match_no, status, payload, created_at, updated_at
  ) values (
    v_uid, v_id, v_name, v_addr, nullif(v_match, ''), v_status, v_payload, coalesce(v_created, now()), now()
  )
  on conflict (owner_id, id) do update set
    tenant_name = excluded.tenant_name,
    address = excluded.address,
    match_no = excluded.match_no,
    status = excluded.status,
    payload = excluded.payload,
    updated_at = now();

  return json_build_object(
    'ok', true,
    'id', v_id,
    'case', (
      select payload || jsonb_build_object(
        'id', id,
        'updatedAt', updated_at,
        'createdAt', created_at
      )
      from public.termination_cases
      where owner_id = v_uid and id = v_id
    )
  );
end;
$$;

create or replace function public.termination_case_delete(p_token text, p_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_id text;
  v_n int;
begin
  v_uid := public.termination_case_uid(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  v_id := trim(coalesce(p_id, ''));
  if v_id = '' then
    return json_build_object('ok', false, 'error', '請選擇要刪除的暫存');
  end if;
  delete from public.termination_cases
  where owner_id = v_uid and id = v_id;
  get diagnostics v_n = row_count;
  if v_n < 1 then
    return json_build_object('ok', false, 'error', '找不到這筆暫存，或已刪除');
  end if;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.termination_case_uid(text) to anon, authenticated;
grant execute on function public.termination_case_list(text) to anon, authenticated;
grant execute on function public.termination_case_upsert(text, jsonb) to anon, authenticated;
grant execute on function public.termination_case_delete(text, text) to anon, authenticated;
