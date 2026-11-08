-- 誠信險未投保人員：11/1 起新媒合的處長電訪紀錄
-- 五項都勾完才寫入撥打時間。後台用總管密碼讀取。

create table if not exists public.biz_coverage_call (
  match_no text primary key,
  sales_name text not null default '',
  office text not null default '',
  address text not null default '',
  lease_start date,
  landlord_name text not null default '',
  tenant_name text not null default '',
  extension text not null default '',
  note text not null default '',
  landlord_done boolean not null default false,
  tenant_done boolean not null default false,
  service_done boolean not null default false,
  payment_done boolean not null default false,
  anomaly_done boolean not null default false,
  landlord_at timestamptz,
  tenant_at timestamptz,
  completed_at timestamptz,
  completed_by text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

alter table public.biz_coverage_call enable row level security;
revoke all on table public.biz_coverage_call from public, anon, authenticated;

create or replace function public.biz_coverage_call_row_json(r public.biz_coverage_call)
returns json
language sql
stable
as $$
  select json_build_object(
    'matchNo', r.match_no,
    'salesName', r.sales_name,
    'office', r.office,
    'address', r.address,
    'leaseStart', to_char(r.lease_start, 'YYYY-MM-DD'),
    'landlordName', r.landlord_name,
    'tenantName', r.tenant_name,
    'extension', r.extension,
    'note', r.note,
    'landlordDone', r.landlord_done,
    'tenantDone', r.tenant_done,
    'serviceDone', r.service_done,
    'paymentDone', r.payment_done,
    'anomalyDone', r.anomaly_done,
    'landlordAt', r.landlord_at,
    'tenantAt', r.tenant_at,
    'completedAt', r.completed_at,
    'completedBy', r.completed_by,
    'updatedAt', r.updated_at,
    'updatedBy', r.updated_by
  );
$$;

create or replace function public.biz_coverage_call_list(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  return json_build_object(
    'ok', true,
    'rows', coalesce((
      select json_agg(public.biz_coverage_call_row_json(a) order by a.updated_at desc)
      from (
        select * from public.biz_coverage_call
        order by updated_at desc
        limit 2000
      ) a
    ), '[]'::json)
  );
end;
$$;

create or replace function public.biz_coverage_call_save(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_name text;
  v_team text;
  v_title text;
  v_match text;
  v_office text;
  v_sales text;
  v_address text;
  v_lease date;
  v_landlord text;
  v_tenant text;
  v_ext text;
  v_note text;
  v_landlord_done boolean;
  v_tenant_done boolean;
  v_service_done boolean;
  v_payment_done boolean;
  v_anomaly_done boolean;
  v_landlord_at timestamptz;
  v_tenant_at timestamptz;
  v_old public.biz_coverage_call%rowtype;
  v_done_at timestamptz;
  v_done_by text;
  v_row public.biz_coverage_call%rowtype;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select
    trim(coalesce(nullif(a.name, ''), a.username)),
    trim(coalesce(a.team, '')),
    trim(coalesce(a.job_title, ''))
    into v_name, v_team, v_title
  from public.toolbox_accounts a where a.id = v_uid;
  if coalesce(v_name, '') = '' then
    return json_build_object('ok', false, 'error', '帳號沒有姓名');
  end if;
  if v_title not in ('營業處經理', '儲備處經理', '儲備營業處經理') then
    return json_build_object('ok', false, 'error', '只有處長可以勾選');
  end if;

  v_match := left(trim(coalesce(p_data->>'matchNo', '')), 40);
  v_office := left(trim(coalesce(p_data->>'office', '')), 40);
  v_sales := left(trim(coalesce(p_data->>'salesName', '')), 20);
  v_address := left(trim(coalesce(p_data->>'address', '')), 120);
  v_landlord := left(trim(coalesce(p_data->>'landlordName', '')), 20);
  v_tenant := left(trim(coalesce(p_data->>'tenantName', '')), 20);
  v_ext := trim(coalesce(p_data->>'extension', ''));
  v_note := left(trim(coalesce(p_data->>'note', '')), 500);
  if v_match = '' or char_length(v_match) < 4 then
    return json_build_object('ok', false, 'error', '媒合編號不正確');
  end if;
  if v_ext <> '' and v_ext !~ '^\d{1,8}$' then
    return json_build_object('ok', false, 'error', '分機請填數字');
  end if;
  if coalesce(p_data->>'leaseStart', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_lease := (p_data->>'leaseStart')::date;
  else
    v_lease := null;
  end if;

  v_landlord_done := coalesce((p_data->>'landlordDone')::boolean, false);
  v_tenant_done := coalesce((p_data->>'tenantDone')::boolean, false);
  v_service_done := coalesce((p_data->>'serviceDone')::boolean, false);
  v_payment_done := coalesce((p_data->>'paymentDone')::boolean, false);
  v_anomaly_done := coalesce((p_data->>'anomalyDone')::boolean, false);

  select * into v_old from public.biz_coverage_call where match_no = v_match;
  if v_landlord_done then
    if v_old.landlord_done and v_old.landlord_at is not null then
      v_landlord_at := v_old.landlord_at;
    else
      v_landlord_at := now();
    end if;
  else
    v_landlord_at := null;
  end if;
  if v_tenant_done then
    if v_old.tenant_done and v_old.tenant_at is not null then
      v_tenant_at := v_old.tenant_at;
    else
      v_tenant_at := now();
    end if;
  else
    v_tenant_at := null;
  end if;
  if v_landlord_at is not null and v_tenant_at is not null then
    v_done_at := greatest(v_landlord_at, v_tenant_at);
    v_done_by := v_name;
  else
    v_done_at := null;
    v_done_by := '';
  end if;

  insert into public.biz_coverage_call (
    match_no, sales_name, office, address, lease_start, landlord_name, tenant_name,
    extension, note, landlord_done, tenant_done, service_done, payment_done, anomaly_done,
    landlord_at, tenant_at, completed_at, completed_by, updated_at, updated_by
  ) values (
    v_match, v_sales, v_office, v_address, v_lease, v_landlord, v_tenant,
    v_ext, v_note, v_landlord_done, v_tenant_done, v_service_done, v_payment_done, v_anomaly_done,
    v_landlord_at, v_tenant_at, v_done_at, v_done_by, now(), v_name
  )
  on conflict (match_no) do update set
    sales_name = excluded.sales_name,
    office = excluded.office,
    address = excluded.address,
    lease_start = excluded.lease_start,
    landlord_name = excluded.landlord_name,
    tenant_name = excluded.tenant_name,
    extension = excluded.extension,
    note = excluded.note,
    landlord_done = excluded.landlord_done,
    tenant_done = excluded.tenant_done,
    service_done = excluded.service_done,
    payment_done = excluded.payment_done,
    anomaly_done = excluded.anomaly_done,
    landlord_at = excluded.landlord_at,
    tenant_at = excluded.tenant_at,
    completed_at = excluded.completed_at,
    completed_by = excluded.completed_by,
    updated_at = now(),
    updated_by = excluded.updated_by
  returning * into v_row;

  return json_build_object('ok', true, 'row', public.biz_coverage_call_row_json(v_row));
end;
$$;

create or replace function public.biz_coverage_call_admin_list(p_secret text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  return json_build_object(
    'ok', true,
    'counts', (
      select json_build_object(
        'all', count(*),
        'done', count(*) filter (where landlord_at is not null and tenant_at is not null),
        'open', count(*) filter (where landlord_at is null or tenant_at is null)
      ) from public.biz_coverage_call
    ),
    'rows', coalesce((
      select json_agg(public.biz_coverage_call_row_json(a) order by a.updated_at desc)
      from (
        select * from public.biz_coverage_call
        order by updated_at desc
        limit 2000
      ) a
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.biz_coverage_call_row_json(public.biz_coverage_call) from public, anon, authenticated;
grant execute on function public.biz_coverage_call_list(text) to anon, authenticated;
grant execute on function public.biz_coverage_call_save(text, jsonb) to anon, authenticated;
grant execute on function public.biz_coverage_call_admin_list(text) to anon, authenticated;

-- 總管刪除單筆（亦見 biz-coverage-call-delete.sql）
create or replace function public.biz_coverage_call_admin_delete(p_secret text, p_match_no text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match text := left(trim(coalesce(p_match_no, '')), 40);
  v_deleted int := 0;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if v_match = '' or char_length(v_match) < 4 then
    return json_build_object('ok', false, 'error', '媒合編號不正確');
  end if;
  delete from public.biz_coverage_call
  where match_no = v_match;
  get diagnostics v_deleted = row_count;
  if v_deleted < 1 then
    return json_build_object('ok', false, 'error', '找不到這筆電訪紀錄');
  end if;
  return json_build_object('ok', true, 'matchNo', v_match, 'deleted', v_deleted);
end;
$$;

revoke all on function public.biz_coverage_call_admin_delete(text, text) from public, anon, authenticated;
grant execute on function public.biz_coverage_call_admin_delete(text, text) to anon, authenticated;
