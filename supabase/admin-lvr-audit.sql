-- 實價登錄稽核（不算點；登入同仁皆可看／填；填寫人帶工具箱帳號）
-- 節點可複選並指定各自誰錯；後台通過後才發查錯獎 300、才列入處長停權統計
-- 依賴：toolbox_accounts / toolbox_sessions、admin_qa_user_id(p_token)、toolbox_check_admin(p_secret)

create table if not exists public.admin_lvr_audit (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references public.toolbox_accounts (id),
  author_name text not null default '',
  address text not null default '',
  office text not null default '',
  sales_name text not null default '',
  office_manager text not null default '',
  reviewer_name text not null default '',
  audit_node text not null default '',
  node_faults jsonb not null default '[]'::jsonb,
  error_reason text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  review_status text not null default 'pending',
  admin_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by text not null default '',
  reward_amount integer not null default 0
);

alter table public.admin_lvr_audit
  add column if not exists office_manager text not null default '';
alter table public.admin_lvr_audit
  add column if not exists audit_node text not null default '';
alter table public.admin_lvr_audit
  add column if not exists node_faults jsonb not null default '[]'::jsonb;
alter table public.admin_lvr_audit
  add column if not exists review_status text not null default 'pending';
alter table public.admin_lvr_audit
  add column if not exists admin_note text not null default '';
alter table public.admin_lvr_audit
  add column if not exists reviewed_at timestamptz;
alter table public.admin_lvr_audit
  add column if not exists reviewed_by text not null default '';
alter table public.admin_lvr_audit
  add column if not exists reward_amount integer not null default 0;
-- 歸屬月份（民國 年/月，例 115/10）；新填自動帶台北時間當月，後台可改
alter table public.admin_lvr_audit
  add column if not exists audit_month text not null default '';

-- 115/11/04 前填的一律算 115/10
update public.admin_lvr_audit
   set audit_month = '115/10'
 where audit_month = ''
   and created_at < timestamptz '2026-11-04 00:00:00+08';
update public.admin_lvr_audit
   set audit_month = (extract(year from created_at at time zone 'Asia/Taipei')::int - 1911)::text
                     || '/' || to_char(created_at at time zone 'Asia/Taipei', 'MM')
 where audit_month = '';

create index if not exists admin_lvr_audit_month_idx on public.admin_lvr_audit (audit_month);
create index if not exists admin_lvr_audit_created_idx on public.admin_lvr_audit (created_at desc);
create index if not exists admin_lvr_audit_user_idx on public.admin_lvr_audit (user_id);
create index if not exists admin_lvr_audit_status_idx on public.admin_lvr_audit (review_status);

alter table public.admin_lvr_audit enable row level security;
revoke all on public.admin_lvr_audit from public, anon, authenticated;

insert into storage.buckets (id, name, public)
values ('admin-lvr-audit', 'admin-lvr-audit', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists admin_lvr_audit_anon_insert on storage.objects;
create policy admin_lvr_audit_anon_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'admin-lvr-audit');

drop policy if exists admin_lvr_audit_public_read on storage.objects;
create policy admin_lvr_audit_public_read on storage.objects
  for select to anon, authenticated, public
  using (bucket_id = 'admin-lvr-audit');

create or replace function public.admin_lvr_audit_prepare_upload(p_token text, p_ext text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_ext text;
  v_path text;
  v_base text := 'https://xpbownhiedurytlyqszu.supabase.co/storage/v1/object/public/admin-lvr-audit/';
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  v_ext := lower(trim(coalesce(p_ext, 'jpg')));
  v_ext := regexp_replace(v_ext, '[^a-z0-9]', '', 'g');
  if v_ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', '7z', 'txt', 'csv') then
    return json_build_object('ok', false, 'error', '不支援的檔案格式');
  end if;
  v_path := v_uid::text || '/' || gen_random_uuid()::text || '.' || v_ext;
  return json_build_object('ok', true, 'path', v_path, 'publicUrl', v_base || v_path);
end;
$$;

create or replace function public.admin_lvr_audit_current_month()
returns text
language sql
stable
as $$
  select (extract(year from now() at time zone 'Asia/Taipei')::int - 1911)::text
         || '/' || to_char(now() at time zone 'Asia/Taipei', 'MM');
$$;

create or replace function public.admin_lvr_audit_row_json(a public.admin_lvr_audit)
returns json
language sql
stable
as $$
  select json_build_object(
    'id', a.id,
    'createdAt', a.created_at,
    'auditMonth', a.audit_month,
    'authorName', a.author_name,
    'userId', a.user_id,
    'address', a.address,
    'office', a.office,
    'salesName', a.sales_name,
    'officeManager', a.office_manager,
    'reviewerName', a.reviewer_name,
    'auditNode', a.audit_node,
    'nodeFaults', a.node_faults,
    'errorReason', a.error_reason,
    'attachments', a.attachments,
    'reviewStatus', a.review_status,
    'adminNote', a.admin_note,
    'reviewedAt', a.reviewed_at,
    'reviewedBy', a.reviewed_by,
    'rewardAmount', a.reward_amount
  );
$$;

create or replace function public.admin_lvr_audit_normalize_faults(p_faults jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_node text;
  v_person text;
  v_obj jsonb;
  v_seen text[] := array[]::text[];
begin
  if jsonb_typeof(p_faults) <> 'array' then
    return '[]'::jsonb;
  end if;
  for v_item in select * from jsonb_array_elements(p_faults)
  loop
    v_node := left(trim(coalesce(v_item->>'node', '')), 20);
    v_person := left(trim(coalesce(v_item->>'person', '')), 40);
    if v_node not in ('預審', '物審', '房客審', '複審') then
      continue;
    end if;
    if v_person = '' then
      continue;
    end if;
    if v_node = any (v_seen) then
      continue;
    end if;
    v_seen := array_append(v_seen, v_node);
    v_obj := jsonb_build_object('node', v_node, 'person', v_person);
    -- 複審可另勾「系統與紙本不符」
    if v_node = '複審' and lower(coalesce(v_item->>'mismatch', '')) in ('true', '1') then
      v_obj := v_obj || jsonb_build_object('mismatch', true);
    end if;
    v_out := v_out || jsonb_build_array(v_obj);
  end loop;
  return v_out;
end;
$$;

create or replace function public.admin_lvr_audit_list(p_token text)
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
      select json_agg(public.admin_lvr_audit_row_json(a) order by a.created_at desc, a.id desc)
      from (
        select *
        from public.admin_lvr_audit
        order by created_at desc, id desc
        limit 500
      ) a
    ), '[]'::json)
  );
end;
$$;

create or replace function public.admin_lvr_audit_save(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_name text;
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_address text := left(trim(coalesce(d->>'address', '')), 200);
  v_office text := left(trim(coalesce(d->>'office', '')), 40);
  v_sales text := left(trim(coalesce(d->>'salesName', '')), 40);
  v_mgr text := left(trim(coalesce(d->>'officeManager', '')), 40);
  v_reason text := left(trim(coalesce(d->>'errorReason', '')), 4000);
  v_atts jsonb := coalesce(d->'attachments', '[]'::jsonb);
  v_faults jsonb;
  v_nodes text;
  v_first_person text;
  v_id bigint;
  v_month text := public.admin_lvr_audit_current_month();
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_name
  from public.toolbox_accounts a where a.id = v_uid;
  if coalesce(v_name, '') = '' then
    return json_build_object('ok', false, 'error', '帳號沒有姓名，請聯絡管理員');
  end if;
  if v_address = '' then return json_build_object('ok', false, 'error', '請填地址'); end if;
  if v_office = '' then return json_build_object('ok', false, 'error', '請先帶入營業處'); end if;
  if v_sales = '' then return json_build_object('ok', false, 'error', '請先帶入業務姓名'); end if;
  if v_mgr = '' then return json_build_object('ok', false, 'error', '請填營業處經理姓名'); end if;
  if v_reason = '' then return json_build_object('ok', false, 'error', '請填錯誤原因'); end if;

  v_faults := public.admin_lvr_audit_normalize_faults(coalesce(d->'nodeFaults', '[]'::jsonb));
  if jsonb_array_length(v_faults) < 1 then
    if left(trim(coalesce(d->>'auditNode', '')), 20) in ('預審', '物審', '房客審', '複審')
       and left(trim(coalesce(d->>'reviewerName', d->>'faultPerson', '')), 40) <> '' then
      v_faults := jsonb_build_array(jsonb_build_object(
        'node', left(trim(d->>'auditNode'), 20),
        'person', left(trim(coalesce(d->>'reviewerName', d->>'faultPerson', '')), 40)
      ));
    else
      return json_build_object('ok', false, 'error', '請至少選一個錯誤節點，並填該節點誰錯');
    end if;
  end if;

  if jsonb_typeof(v_atts) <> 'array' then v_atts := '[]'::jsonb; end if;
  if jsonb_array_length(v_atts) < 1 then
    return json_build_object('ok', false, 'error', '請至少上傳 1 張照片或附件');
  end if;
  if jsonb_array_length(v_atts) > 12 then
    return json_build_object('ok', false, 'error', '附件最多 12 個');
  end if;

  select string_agg(x->>'node', '、' order by ord), (array_agg(x->>'person' order by ord))[1]
    into v_nodes, v_first_person
  from jsonb_array_elements(v_faults) with ordinality as t(x, ord);

  insert into public.admin_lvr_audit (
    user_id, author_name, address, office, sales_name, office_manager,
    reviewer_name, audit_node, node_faults, error_reason, attachments,
    review_status, reward_amount, audit_month
  ) values (
    v_uid, v_name, v_address, v_office, v_sales, v_mgr,
    coalesce(v_first_person, ''), coalesce(v_nodes, ''), v_faults, v_reason, v_atts,
    'pending', 0, v_month
  ) returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'authorName', v_name, 'auditMonth', v_month);
end;
$$;

create or replace function public.admin_lvr_audit_delete(p_token text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_name text;
  v_owner uuid;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_name
  from public.toolbox_accounts a where a.id = v_uid;
  select user_id into v_owner from public.admin_lvr_audit where id = p_id;
  if v_owner is null then return json_build_object('ok', false, 'error', '找不到這筆資料'); end if;
  if v_owner <> v_uid and coalesce(v_name, '') not in ('簡為倢', '邱奕棋', '黃怡婷') then
    return json_build_object('ok', false, 'error', '只能刪自己填的稽核');
  end if;
  delete from public.admin_lvr_audit where id = p_id;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_lvr_audit_admin_list(p_secret text)
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
    'rows', coalesce((
      select json_agg(public.admin_lvr_audit_row_json(a) order by a.created_at desc, a.id desc)
      from (
        select *
        from public.admin_lvr_audit
        order by created_at desc, id desc
        limit 2000
      ) a
    ), '[]'::json)
  );
end;
$$;

create or replace function public.admin_lvr_audit_admin_update(p_secret text, p_id bigint, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_address text := left(trim(coalesce(d->>'address', '')), 200);
  v_office text := left(trim(coalesce(d->>'office', '')), 40);
  v_sales text := left(trim(coalesce(d->>'salesName', '')), 40);
  v_mgr text := left(trim(coalesce(d->>'officeManager', '')), 40);
  v_reason text := left(trim(coalesce(d->>'errorReason', '')), 4000);
  v_author text := left(trim(coalesce(d->>'authorName', '')), 40);
  v_month text := trim(coalesce(d->>'auditMonth', ''));
  v_faults jsonb;
  v_nodes text;
  v_first_person text;
  v_note text := left(trim(coalesce(d->>'adminNote', '')), 2000);
  v_status text := lower(trim(coalesce(d->>'reviewStatus', '')));
  v_reviewer text := left(trim(coalesce(d->>'reviewedBy', '')), 40);
  v_reward int := 0;
  v_old_status text;
  v_old_reviewed_at timestamptz;
  v_old_reviewed_by text;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_id is null then return json_build_object('ok', false, 'error', '缺少 id'); end if;
  if v_address = '' or v_office = '' or v_sales = '' or v_mgr = '' or v_reason = '' then
    return json_build_object('ok', false, 'error', '欄位不可空白');
  end if;
  if d ? 'authorName' and v_author = '' then
    return json_build_object('ok', false, 'error', '填寫人不可空白');
  end if;
  if d ? 'auditMonth' and v_month !~ '^[0-9]{3}/(0[1-9]|1[0-2])$' then
    return json_build_object('ok', false, 'error', '月份格式要像 115/10');
  end if;

  select review_status, reviewed_at, reviewed_by
    into v_old_status, v_old_reviewed_at, v_old_reviewed_by
  from public.admin_lvr_audit where id = p_id;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆資料'); end if;

  v_faults := public.admin_lvr_audit_normalize_faults(coalesce(d->'nodeFaults', '[]'::jsonb));
  if jsonb_array_length(v_faults) < 1 then
    if left(trim(coalesce(d->>'auditNode', '')), 20) in ('預審', '物審', '房客審', '複審')
       and left(trim(coalesce(d->>'reviewerName', '')), 40) <> '' then
      v_faults := jsonb_build_array(jsonb_build_object(
        'node', left(trim(d->>'auditNode'), 20),
        'person', left(trim(d->>'reviewerName'), 40)
      ));
    else
      return json_build_object('ok', false, 'error', '請至少一個錯誤節點與審核人員');
    end if;
  end if;

  select string_agg(x->>'node', '、' order by ord), (array_agg(x->>'person' order by ord))[1]
    into v_nodes, v_first_person
  from jsonb_array_elements(v_faults) with ordinality as t(x, ord);

  if v_status not in ('pending', 'approved', 'rejected') then
    v_status := coalesce(v_old_status, 'pending');
  end if;
  if v_status = 'approved' then v_reward := 300; else v_reward := 0; end if;

  update public.admin_lvr_audit set
    author_name = case when d ? 'authorName' then v_author else author_name end,
    audit_month = case when d ? 'auditMonth' then v_month else audit_month end,
    address = v_address,
    office = v_office,
    sales_name = v_sales,
    office_manager = v_mgr,
    reviewer_name = coalesce(v_first_person, ''),
    audit_node = coalesce(v_nodes, ''),
    node_faults = v_faults,
    error_reason = v_reason,
    admin_note = case when d ? 'adminNote' then v_note else admin_note end,
    review_status = v_status,
    reward_amount = v_reward,
    reviewed_at = case
      when v_status = 'pending' then null
      when v_status <> coalesce(v_old_status, '') then now()
      else v_old_reviewed_at
    end,
    reviewed_by = case
      when v_status = 'pending' then ''
      when v_reviewer <> '' then v_reviewer
      else coalesce(v_old_reviewed_by, '')
    end
  where id = p_id;

  return json_build_object('ok', true, 'rewardAmount', v_reward, 'reviewStatus', v_status);
end;
$$;

create or replace function public.admin_lvr_audit_admin_delete(p_secret text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  delete from public.admin_lvr_audit where id = p_id;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆資料'); end if;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.admin_lvr_audit_current_month() from public;
grant execute on function public.admin_lvr_audit_current_month() to anon, authenticated;
revoke all on function public.admin_lvr_audit_prepare_upload(text, text) from public;
revoke all on function public.admin_lvr_audit_list(text) from public;
revoke all on function public.admin_lvr_audit_save(text, jsonb) from public;
revoke all on function public.admin_lvr_audit_delete(text, bigint) from public;
revoke all on function public.admin_lvr_audit_admin_list(text) from public;
revoke all on function public.admin_lvr_audit_admin_update(text, bigint, jsonb) from public;
revoke all on function public.admin_lvr_audit_admin_delete(text, bigint) from public;
grant execute on function public.admin_lvr_audit_prepare_upload(text, text) to anon, authenticated;
grant execute on function public.admin_lvr_audit_list(text) to anon, authenticated;
grant execute on function public.admin_lvr_audit_save(text, jsonb) to anon, authenticated;
grant execute on function public.admin_lvr_audit_delete(text, bigint) to anon, authenticated;
grant execute on function public.admin_lvr_audit_admin_list(text) to anon, authenticated;
grant execute on function public.admin_lvr_audit_admin_update(text, bigint, jsonb) to anon, authenticated;
grant execute on function public.admin_lvr_audit_admin_delete(text, bigint) to anon, authenticated;
