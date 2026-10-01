-- 行政專區：星鴻註銷物件申請（取代 Google 表單）

create table if not exists public.object_cancel_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  username text not null default '',
  user_name text not null default '',
  team text not null default '',
  dept text not null,
  applicant text not null,
  agent_name text not null,
  region text not null,
  object_type text not null check (object_type in ('代管物件', '包租物件')),
  contract_status text not null,
  lease_start date not null,
  lease_end date not null,
  address text not null,
  note text not null,
  taker_company text not null,
  taker_agent text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  admin_note text not null default '',
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists object_cancel_requests_created_idx on public.object_cancel_requests (created_at desc);
create index if not exists object_cancel_requests_user_idx on public.object_cancel_requests (user_id, created_at desc);
alter table public.object_cancel_requests enable row level security;
revoke all on public.object_cancel_requests from anon, authenticated;

create or replace function public.object_cancel_submit(p_token text, p_data jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_row public.object_cancel_requests%rowtype;
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_start date; v_end date; k text;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;

  foreach k in array array['dept', 'applicant', 'agentName', 'region', 'objectType', 'contractStatus',
    'leaseStart', 'leaseEnd', 'address', 'note', 'takerCompany', 'takerAgent'] loop
    if nullif(trim(coalesce(d ->> k, '')), '') is null then
      return json_build_object('ok', false, 'error', '還有欄位沒填');
    end if;
  end loop;

  if d ->> 'dept' not in ('北一處', '北二處', '北三處', '北四處', '北五處', '桃一處', '宜一處', '基一處', '彰一處', '投一處',
    '竹一處', '中一處', '中二處', '中三處', '中四處', '中五處', '中六處', '嘉一處', '南一處', '南二處', '高一處', '高二處', '租賃管理部') then
    return json_build_object('ok', false, 'error', '申請處所不正確');
  end if;
  if d ->> 'region' not in ('新北市', '臺北市', '桃園市', '宜蘭縣', '基隆市', '臺中市', '新竹市', '新竹縣', '彰化縣',
    '南投縣', '嘉義市', '嘉義縣', '臺南市', '高雄市') then
    return json_build_object('ok', false, 'error', '物件所在區域不正確');
  end if;
  if d ->> 'objectType' not in ('代管物件', '包租物件') then
    return json_build_object('ok', false, 'error', '物件型態不正確');
  end if;

  begin
    v_start := (d ->> 'leaseStart')::date;
    v_end := (d ->> 'leaseEnd')::date;
  exception when others then
    return json_build_object('ok', false, 'error', '日期格式不正確');
  end;
  if v_end < v_start then return json_build_object('ok', false, 'error', '租約到期日不能早於租約開始日期'); end if;

  insert into public.object_cancel_requests (user_id, username, user_name, team, dept, applicant, agent_name, region,
    object_type, contract_status, lease_start, lease_end, address, note, taker_company, taker_agent)
  values (v_uid, v_acc.username, coalesce(nullif(v_acc.name, ''), v_acc.username), coalesce(v_acc.team, ''),
    d ->> 'dept', left(trim(d ->> 'applicant'), 50), left(trim(d ->> 'agentName'), 50), d ->> 'region',
    d ->> 'objectType', left(trim(d ->> 'contractStatus'), 200), v_start, v_end, left(trim(d ->> 'address'), 200),
    left(trim(d ->> 'note'), 2000), left(trim(d ->> 'takerCompany'), 100), left(trim(d ->> 'takerAgent'), 50))
  returning * into v_row;

  return json_build_object('ok', true, 'id', v_row.id, 'createdAt', v_row.created_at);
end; $$;

create or replace function public.object_cancel_my(p_token text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  return json_build_object('ok', true, 'items', coalesce((select json_agg(row_to_json(x)) from (
    select id, address, object_type as "objectType", status, admin_note as "adminNote",
      created_at as "createdAt", handled_at as "handledAt"
    from public.object_cancel_requests where user_id = v_uid
    order by created_at desc limit 30
  ) x), '[]'::json));
end; $$;

create or replace function public.object_cancel_admin_list(p_secret text, p_query text default '', p_status text default '', p_limit int default 500)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_q text := trim(coalesce(p_query, '')); v_s text := trim(coalesce(p_status, ''));
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true,
    'counts', (select json_build_object(
      'all', count(*), 'pending', count(*) filter (where status = 'pending'),
      'done', count(*) filter (where status = 'done'), 'rejected', count(*) filter (where status = 'rejected'))
      from public.object_cancel_requests),
    'items', coalesce((select json_agg(row_to_json(x)) from (
      select id, username, user_name as "userName", team, dept, applicant, agent_name as "agentName", region,
        object_type as "objectType", contract_status as "contractStatus", lease_start as "leaseStart",
        lease_end as "leaseEnd", address, note, taker_company as "takerCompany", taker_agent as "takerAgent",
        status, admin_note as "adminNote", handled_at as "handledAt", created_at as "createdAt"
      from public.object_cancel_requests
      where (v_s = '' or status = v_s)
        and (v_q = '' or address ilike '%' || v_q || '%' or applicant ilike '%' || v_q || '%'
          or agent_name ilike '%' || v_q || '%' or dept ilike '%' || v_q || '%' or user_name ilike '%' || v_q || '%'
          or taker_company ilike '%' || v_q || '%' or taker_agent ilike '%' || v_q || '%')
      order by created_at desc limit greatest(1, least(coalesce(p_limit, 500), 2000))
    ) x), '[]'::json));
end; $$;

create or replace function public.object_cancel_admin_update(p_secret text, p_id bigint, p_status text, p_admin_note text default '')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_row public.object_cancel_requests%rowtype;
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  if p_status not in ('pending', 'done', 'rejected') then return json_build_object('ok', false, 'error', '狀態不正確'); end if;
  update public.object_cancel_requests set
    status = p_status,
    admin_note = left(trim(coalesce(p_admin_note, '')), 1000),
    handled_at = case when p_status = 'pending' then null else now() end
  where id = p_id
  returning * into v_row;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆申請'); end if;
  return json_build_object('ok', true, 'status', v_row.status, 'handledAt', v_row.handled_at);
end; $$;

create or replace function public.object_cancel_admin_delete(p_secret text, p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  delete from public.object_cancel_requests where id = p_id;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆申請'); end if;
  return json_build_object('ok', true);
end; $$;

grant execute on function public.object_cancel_submit(text, jsonb) to anon, authenticated;
grant execute on function public.object_cancel_my(text) to anon, authenticated;
grant execute on function public.object_cancel_admin_list(text, text, text, int) to anon, authenticated;
grant execute on function public.object_cancel_admin_update(text, bigint, text, text) to anon, authenticated;
grant execute on function public.object_cancel_admin_delete(text, bigint) to anon, authenticated;
