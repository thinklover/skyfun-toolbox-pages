-- 財務部問題回報：表單送出 → 財務部 LINE 通知 → 後台下載附件
-- 依賴：toolbox_accounts、admin_qa_user_id(p_token)、line_settings、line_bindings、pg_net、toolbox_check_admin

create extension if not exists pg_net with schema extensions;

create table if not exists public.fin_reports (
  id bigserial primary key,
  user_id uuid references public.toolbox_accounts(id) on delete set null,
  user_name text not null default '',
  full_name text not null,
  office text not null,
  issue_type text not null,
  payload jsonb not null default '{}'::jsonb,
  line_error text not null default '',
  line_recipients int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists fin_reports_created_idx on public.fin_reports (created_at desc);
create index if not exists fin_reports_issue_idx on public.fin_reports (issue_type, created_at desc);

alter table public.fin_reports enable row level security;
revoke all on public.fin_reports from public, anon, authenticated;

create table if not exists public.fin_report_files (
  id bigserial primary key,
  report_id bigint not null references public.fin_reports(id) on delete cascade,
  path text not null default '',
  name text not null default '',
  kind text not null default 'file',
  public_url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists fin_report_files_report_idx on public.fin_report_files (report_id);

alter table public.fin_report_files enable row level security;
revoke all on public.fin_report_files from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fin-report',
  'fin-report',
  true,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fin_report_anon_insert on storage.objects;
create policy fin_report_anon_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'fin-report');

drop policy if exists fin_report_public_read on storage.objects;
create policy fin_report_public_read on storage.objects
  for select to anon, authenticated, public
  using (bucket_id = 'fin-report');

create or replace function public.fin_report_is_finance(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.toolbox_accounts a
    where a.id = p_uid
      and a.status = 'active'
      and (
        trim(coalesce(a.team, '')) = '財務部'
        or trim(coalesce(a.team, '')) = '行政管理部'
        or trim(coalesce(a.team, '')) = '總經理室'
      )
  );
$$;

create or replace function public.fin_report_row_json(r public.fin_reports)
returns json
language sql
stable
as $$
  select json_build_object(
    'id', r.id,
    'createdAt', r.created_at,
    'userName', r.user_name,
    'fullName', r.full_name,
    'office', r.office,
    'issueType', r.issue_type,
    'payload', r.payload,
    'lineError', r.line_error,
    'lineRecipients', r.line_recipients,
    'files', coalesce((
      select json_agg(json_build_object(
        'id', f.id,
        'name', f.name,
        'kind', f.kind,
        'url', f.public_url
      ) order by f.id)
      from public.fin_report_files f
      where f.report_id = r.id
    ), '[]'::json)
  );
$$;

create or replace function public.fin_report_prepare_upload(p_token text, p_ext text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_ext text;
  v_path text;
  v_base text := 'https://xpbownhiedurytlyqszu.supabase.co/storage/v1/object/public/fin-report/';
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  v_ext := lower(trim(coalesce(p_ext, 'pdf')));
  v_ext := regexp_replace(v_ext, '[^a-z0-9]', '', 'g');
  if v_ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx') then
    return json_build_object('ok', false, 'error', '只接受圖片、PDF 或 Office 文件');
  end if;
  v_path := v_uid::text || '/' || gen_random_uuid()::text || '.' || v_ext;
  return json_build_object('ok', true, 'path', v_path, 'publicUrl', v_base || v_path);
end;
$$;

create or replace function public.fin_report_push_finance(p_msg text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_to text[];
  v_req bigint;
begin
  select value into v_token from public.line_settings where key = 'channel_access_token';
  if coalesce(v_token, '') = '' then
    return json_build_object('recipients', 0, 'error', 'LINE 尚未設定');
  end if;
  -- 僅推播後台勾選「收財務回報通知」的人（見 fin-report-line-notify.sql）
  select array_agg(distinct b.line_user_id) into v_to
  from public.line_bindings b
  join public.toolbox_accounts a on a.id = b.user_id
  where a.status = 'active'
    and b.notify_fin_report = true
    and coalesce(b.line_user_id, '') <> '';
  if v_to is null then
    return json_build_object('recipients', 0, 'error', '尚未設定財務回報 LINE 通知對象（請至後台勾選）');
  end if;
  select net.http_post(
    url := 'https://api.line.me/v2/bot/message/multicast',
    body := jsonb_build_object(
      'to', to_jsonb(v_to),
      'messages', jsonb_build_array(jsonb_build_object('type', 'text', 'text', left(p_msg, 4900)))
    ),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Content-Type', 'application/json'
    )
  ) into v_req;
  return json_build_object('recipients', array_length(v_to, 1), 'error', '', 'req', v_req);
end;
$$;

create or replace function public.fin_report_submit(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_user_name text;
  v_full text := left(trim(coalesce(d->>'fullName', '')), 40);
  v_office text := left(trim(coalesce(d->>'office', '')), 40);
  v_type text := left(trim(coalesce(d->>'issueType', '')), 80);
  v_payload jsonb := coalesce(d->'payload', '{}'::jsonb);
  v_files jsonb := coalesce(d->'files', '[]'::jsonb);
  v_item jsonb;
  v_clean jsonb := '[]'::jsonb;
  v_n int := 0;
  v_id bigint;
  v_msg text;
  v_line json;
  v_line_err text := '';
  v_line_n int := 0;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username))
    into v_user_name
  from public.toolbox_accounts a where a.id = v_uid;
  if coalesce(v_user_name, '') = '' then
    return json_build_object('ok', false, 'error', '帳號沒有姓名，請聯絡管理員');
  end if;
  if v_full = '' then return json_build_object('ok', false, 'error', '請填姓名全名'); end if;
  if v_office = '' then return json_build_object('ok', false, 'error', '請選案件所屬處所'); end if;
  if v_type not in (
    '社宅包租金流相關(進件、解約或資料異動)',
    '社宅租金及款項處理',
    '社宅催收管理相關問題',
    '補件與資料查詢',
    '止付通知',
    '一般宅金流相關(進件、解約)',
    '商辦部'
  ) then
    return json_build_object('ok', false, 'error', '請選擇回報問題');
  end if;

  if jsonb_typeof(v_files) = 'array' then
    for v_item in select * from jsonb_array_elements(v_files)
    loop
      if v_n >= 20 then exit; end if;
      if nullif(trim(coalesce(v_item->>'url', '')), '') is null
         and nullif(trim(coalesce(v_item->>'path', '')), '') is null then
        continue;
      end if;
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'path', left(trim(coalesce(v_item->>'path', '')), 300),
        'url', left(trim(coalesce(v_item->>'url', '')), 500),
        'name', left(trim(coalesce(v_item->>'name', '附件')), 120),
        'kind', case when coalesce(v_item->>'kind', '') = 'image' then 'image' else 'file' end
      ));
      v_n := v_n + 1;
    end loop;
  end if;

  insert into public.fin_reports (
    user_id, user_name, full_name, office, issue_type, payload
  ) values (
    v_uid, v_user_name, v_full, v_office, v_type, v_payload
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(v_clean)
  loop
    insert into public.fin_report_files (report_id, path, name, kind, public_url)
    values (
      v_id,
      coalesce(v_item->>'path', ''),
      coalesce(v_item->>'name', '附件'),
      coalesce(v_item->>'kind', 'file'),
      coalesce(v_item->>'url', '')
    );
  end loop;

  v_msg := format(
    E'【財務回報】%s\n填表人：%s\n姓名：%s\n處所：%s\n時間：%s\n請至工具箱後台下載附件：\nhttps://toolbox.skyfunsystem.com/admin/fin-report-dashboard.html',
    v_type,
    v_user_name,
    v_full,
    v_office,
    to_char(now() at time zone 'Asia/Taipei', 'YYYY/MM/DD HH24:MI')
  );
  v_line := public.fin_report_push_finance(v_msg);
  v_line_err := coalesce(v_line->>'error', '');
  v_line_n := coalesce((v_line->>'recipients')::int, 0);

  update public.fin_reports
  set line_error = coalesce(v_line_err, ''),
      line_recipients = coalesce(v_line_n, 0)
  where id = v_id;

  return json_build_object(
    'ok', true,
    'id', v_id,
    'line', json_build_object('recipients', v_line_n, 'error', v_line_err)
  );
end;
$$;

create or replace function public.fin_report_list_for_finance(p_token text, p_limit int default 100)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_lim int := greatest(1, least(coalesce(p_limit, 100), 300));
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  if not public.fin_report_is_finance(v_uid) then
    return json_build_object('ok', false, 'error', '僅財務部／行政／總經理室可查看');
  end if;
  return json_build_object(
    'ok', true,
    'rows', coalesce((
      select json_agg(public.fin_report_row_json(r) order by r.created_at desc, r.id desc)
      from (
        select * from public.fin_reports
        order by created_at desc, id desc
        limit v_lim
      ) r
    ), '[]'::json)
  );
end;
$$;

create or replace function public.fin_report_admin_list(p_secret text, p_limit int default 200)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lim int := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '密碼錯誤');
  end if;
  return json_build_object(
    'ok', true,
    'rows', coalesce((
      select json_agg(public.fin_report_row_json(r) order by r.created_at desc, r.id desc)
      from (
        select * from public.fin_reports
        order by created_at desc, id desc
        limit v_lim
      ) r
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.fin_report_prepare_upload(text, text) to anon, authenticated;
grant execute on function public.fin_report_submit(text, jsonb) to anon, authenticated;
grant execute on function public.fin_report_list_for_finance(text, int) to anon, authenticated;
grant execute on function public.fin_report_admin_list(text, int) to anon, authenticated;
revoke all on function public.fin_report_push_finance(text) from public, anon, authenticated;
revoke all on function public.fin_report_is_finance(uuid) from public, anon, authenticated;
