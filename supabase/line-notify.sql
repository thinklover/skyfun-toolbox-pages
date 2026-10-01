-- LINE 官方帳號通知（取代 Render／公司主機）
-- line_settings：channel_access_token、channel_secret、receipt_group_id（僅 service role 可讀）
-- 推播／Webhook 由 edge functions toolbox-line-webhook、object-cancel、receipt-endorsement 處理

create table if not exists public.line_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.line_settings enable row level security;
revoke all on public.line_settings from anon, authenticated;

create table if not exists public.line_bindings (
  user_id uuid primary key references public.toolbox_accounts(id) on delete cascade,
  line_user_id text not null unique,
  line_name text not null default '',
  notify_object_cancel boolean not null default false,
  bound_at timestamptz not null default now()
);
alter table public.line_bindings enable row level security;
revoke all on public.line_bindings from anon, authenticated;

create table if not exists public.line_bind_codes (
  user_id uuid primary key references public.toolbox_accounts(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null
);
alter table public.line_bind_codes enable row level security;
revoke all on public.line_bind_codes from anon, authenticated;

create table if not exists public.receipt_endorsements (
  id bigint generated always as identity primary key,
  user_id uuid references public.toolbox_accounts(id) on delete set null,
  user_name text not null default '',
  rent_manager_name text not null,
  property_address text not null,
  landlord_name text not null,
  landlord_phone text not null,
  deposit text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  supervisor text not null default '',
  result text not null default '',
  done_by uuid references public.toolbox_accounts(id) on delete set null,
  done_at timestamptz,
  line_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists receipt_endorsements_pending_idx on public.receipt_endorsements (status, created_at desc);
alter table public.receipt_endorsements enable row level security;
revoke all on public.receipt_endorsements from anon, authenticated;

alter table public.object_cancel_requests
  add column if not exists line_notified_at timestamptz,
  add column if not exists line_error text not null default '';

create or replace function public.object_cancel_items_json(p_query text, p_status text, p_limit int)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select r.id, r.username, r.user_name as "userName", r.team, r.dept, r.applicant, r.agent_name as "agentName",
      r.region, r.object_type as "objectType", r.contract_status as "contractStatus", r.lease_start as "leaseStart",
      r.lease_end as "leaseEnd", r.address, r.note, r.taker_company as "takerCompany", r.taker_agent as "takerAgent",
      r.status, r.admin_note as "adminNote", r.handled_at as "handledAt", r.done_by_name as "doneByName",
      r.created_at as "createdAt", r.line_notified_at as "lineNotifiedAt", r.line_error as "lineError",
      (select count(*) from public.object_cancel_files f where f.request_id = r.id) as "fileCount"
    from public.object_cancel_requests r
    where (coalesce(p_status, '') = '' or r.status = p_status)
      and (coalesce(trim(p_query), '') = ''
        or r.address ilike '%' || trim(p_query) || '%' or r.applicant ilike '%' || trim(p_query) || '%'
        or r.agent_name ilike '%' || trim(p_query) || '%' or r.dept ilike '%' || trim(p_query) || '%'
        or r.user_name ilike '%' || trim(p_query) || '%' or r.taker_company ilike '%' || trim(p_query) || '%'
        or r.taker_agent ilike '%' || trim(p_query) || '%')
    order by r.created_at desc
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  ) x;
$$;
revoke all on function public.object_cancel_items_json(text, text, int) from public, anon, authenticated;

create or replace function public.line_my_binding(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_b public.line_bindings%rowtype;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_b from public.line_bindings where user_id = v_uid;
  if not found then return json_build_object('ok', true, 'bound', false); end if;
  return json_build_object('ok', true, 'bound', true, 'lineName', v_b.line_name, 'boundAt', v_b.bound_at,
    'notifyObjectCancel', v_b.notify_object_cancel);
end; $$;

create or replace function public.line_bind_code(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_code text; v_exp timestamptz := now() + interval '10 minutes';
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  delete from public.line_bind_codes where expires_at < now();
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.line_bind_codes where code = v_code and user_id <> v_uid);
  end loop;
  insert into public.line_bind_codes (user_id, code, expires_at) values (v_uid, v_code, v_exp)
  on conflict (user_id) do update set code = excluded.code, expires_at = excluded.expires_at;
  return json_build_object('ok', true, 'code', v_code, 'expiresAt', v_exp);
end; $$;

create or replace function public.line_unbind(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  delete from public.line_bindings where user_id = v_uid;
  delete from public.line_bind_codes where user_id = v_uid;
  return json_build_object('ok', true);
end; $$;

create or replace function public.line_admin_bindings(p_secret text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true, 'items', (
    select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
      select b.user_id as "userId", a.username, a.name, a.team, b.line_name as "lineName",
        b.notify_object_cancel as "notifyObjectCancel", b.bound_at as "boundAt"
      from public.line_bindings b join public.toolbox_accounts a on a.id = b.user_id
      order by b.notify_object_cancel desc, a.team, a.name
    ) x));
end; $$;

create or replace function public.line_admin_set_notify(p_secret text, p_user_id uuid, p_on boolean)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  update public.line_bindings set notify_object_cancel = coalesce(p_on, false) where user_id = p_user_id;
  if not found then return json_build_object('ok', false, 'error', '找不到這個綁定'); end if;
  return json_build_object('ok', true);
end; $$;

create or replace function public.line_admin_unbind(p_secret text, p_user_id uuid)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  delete from public.line_bindings where user_id = p_user_id;
  return json_build_object('ok', true);
end; $$;

grant execute on function public.line_my_binding(text) to anon, authenticated;
grant execute on function public.line_bind_code(text) to anon, authenticated;
grant execute on function public.line_unbind(text) to anon, authenticated;
grant execute on function public.line_admin_bindings(text) to anon, authenticated;
grant execute on function public.line_admin_set_notify(text, uuid, boolean) to anon, authenticated;
grant execute on function public.line_admin_unbind(text, uuid) to anon, authenticated;
