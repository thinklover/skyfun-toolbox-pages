-- 業務專區：系統欄位更改通報
-- 依賴：toolbox_accounts、admin_qa_user_id(p_token)、toolbox_check_admin(p_secret)

create table if not exists public.biz_system_change (
  id bigserial primary key,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  author_name text not null default '',
  team text not null default '',
  modifier_name text not null default '',
  modifier_team text not null default '',
  handler_level text not null default 'manager' check (handler_level in ('manager', 'admin', 'super')),
  address text not null,
  match_no text not null,
  nodes jsonb not null default '[]'::jsonb,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  admin_note text not null default '',
  handled_at timestamptz,
  handled_by text not null default '',
  created_at timestamptz not null default now()
);

alter table public.biz_system_change
  add column if not exists modifier_name text not null default '',
  add column if not exists modifier_team text not null default '';

create index if not exists biz_system_change_created_idx on public.biz_system_change (created_at desc);
create index if not exists biz_system_change_user_idx on public.biz_system_change (user_id, created_at desc);
create index if not exists biz_system_change_status_idx on public.biz_system_change (status, created_at desc);

alter table public.biz_system_change enable row level security;
revoke all on public.biz_system_change from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'biz-system-change',
  'biz-system-change',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists biz_system_change_anon_insert on storage.objects;
create policy biz_system_change_anon_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'biz-system-change');

drop policy if exists biz_system_change_public_read on storage.objects;
create policy biz_system_change_public_read on storage.objects
  for select to anon, authenticated, public
  using (bucket_id = 'biz-system-change');

create or replace function public.biz_system_change_row_json(a public.biz_system_change)
returns json
language sql
stable
as $$
  select json_build_object(
    'id', a.id,
    'createdAt', a.created_at,
    'authorName', a.author_name,
    'team', a.team,
    'userId', a.user_id,
    'modifierName', a.modifier_name,
    'modifierTeam', a.modifier_team,
    'handlerLevel', a.handler_level,
    'address', a.address,
    'matchNo', a.match_no,
    'nodes', a.nodes,
    'content', a.content,
    'attachments', a.attachments,
    'status', a.status,
    'adminNote', a.admin_note,
    'handledAt', a.handled_at,
    'handledBy', a.handled_by
  );
$$;

create or replace function public.biz_system_change_managers(p_token text)
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
    'managers', coalesce((
      select json_agg(json_build_object(
          'name', trim(coalesce(nullif(a.name, ''), a.username)),
          'team', trim(coalesce(a.team, ''))
        ) order by a.team, a.name)
      from public.toolbox_accounts a
      where a.status = 'active'
        and trim(coalesce(a.job_title, '')) = '營業處經理'
        and trim(coalesce(a.team, '')) like '%處'
    ), '[]'::json)
  );
end;
$$;

create or replace function public.biz_system_change_prepare_upload(p_token text, p_ext text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_ext text;
  v_path text;
  v_base text := 'https://xpbownhiedurytlyqszu.supabase.co/storage/v1/object/public/biz-system-change/';
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  v_ext := lower(trim(coalesce(p_ext, 'jpg')));
  v_ext := regexp_replace(v_ext, '[^a-z0-9]', '', 'g');
  if v_ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf') then
    return json_build_object('ok', false, 'error', '只接受圖片或 PDF');
  end if;
  v_path := v_uid::text || '/' || gen_random_uuid()::text || '.' || v_ext;
  return json_build_object('ok', true, 'path', v_path, 'publicUrl', v_base || v_path);
end;
$$;

create or replace function public.biz_system_change_submit(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_name text;
  v_team text;
  v_address text := left(trim(coalesce(d->>'address', '')), 200);
  v_match text := left(trim(coalesce(d->>'matchNo', '')), 80);
  v_content text := left(trim(coalesce(d->>'content', '')), 4000);
  v_mod_name text := left(trim(coalesce(d->>'modifierName', '')), 40);
  v_mod_team text := left(trim(coalesce(d->>'modifierTeam', '')), 40);
  v_nodes_in jsonb := coalesce(d->'nodes', '[]'::jsonb);
  v_nodes jsonb := '[]'::jsonb;
  v_atts jsonb := coalesce(d->'attachments', '[]'::jsonb);
  v_clean jsonb := '[]'::jsonb;
  v_item jsonb;
  v_node text;
  v_n int := 0;
  v_id bigint;
  v_ok boolean := false;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username)), trim(coalesce(a.team, ''))
    into v_name, v_team
  from public.toolbox_accounts a where a.id = v_uid;
  if coalesce(v_name, '') = '' then
    return json_build_object('ok', false, 'error', '帳號沒有姓名，請聯絡管理員');
  end if;
  if v_address = '' then return json_build_object('ok', false, 'error', '請填物件地址'); end if;
  if v_match = '' then return json_build_object('ok', false, 'error', '請填媒合編號'); end if;
  if v_content = '' then return json_build_object('ok', false, 'error', '請輸入需修改內容'); end if;
  if v_mod_name = '' then return json_build_object('ok', false, 'error', '請選擇修改人（營業處長）'); end if;

  if v_mod_team = '其他' then
    v_mod_team := '其他';
  else
    select exists (
      select 1 from public.toolbox_accounts a
      where a.status = 'active'
        and trim(coalesce(a.job_title, '')) = '營業處經理'
        and trim(coalesce(nullif(a.name, ''), a.username)) = v_mod_name
        and (v_mod_team = '' or trim(coalesce(a.team, '')) = v_mod_team)
    ) into v_ok;
    if not v_ok then
      return json_build_object('ok', false, 'error', '修改人必須是營業處經理，或選擇「其他」自行填寫');
    end if;
    if v_mod_team = '' then
      select trim(coalesce(a.team, '')) into v_mod_team
      from public.toolbox_accounts a
      where a.status = 'active'
        and trim(coalesce(a.job_title, '')) = '營業處經理'
        and trim(coalesce(nullif(a.name, ''), a.username)) = v_mod_name
      order by a.team
      limit 1;
    end if;
  end if;

  if jsonb_typeof(v_nodes_in) = 'array' then
    for v_item in select * from jsonb_array_elements(v_nodes_in)
    loop
      v_node := trim(both '"' from v_item::text);
      if v_node in ('物件', '安全檢核表', '房客', '合約')
         and not exists (
           select 1 from jsonb_array_elements_text(v_nodes) t(x) where t.x = v_node
         )
      then
        v_nodes := v_nodes || jsonb_build_array(v_node);
      end if;
    end loop;
  end if;
  if jsonb_array_length(v_nodes) = 0 then
    return json_build_object('ok', false, 'error', '請至少勾選一個需修改節點');
  end if;

  if jsonb_typeof(v_atts) = 'array' then
    for v_item in select * from jsonb_array_elements(v_atts)
    loop
      if v_n >= 5 then exit; end if;
      if nullif(trim(coalesce(v_item->>'url', '')), '') is null then continue; end if;
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'url', left(trim(v_item->>'url'), 500),
        'name', left(trim(coalesce(v_item->>'name', '附件')), 120),
        'kind', case when coalesce(v_item->>'kind', '') = 'image' then 'image' else 'file' end
      ));
      v_n := v_n + 1;
    end loop;
  end if;

  insert into public.biz_system_change (
    user_id, author_name, team, modifier_name, modifier_team,
    address, match_no, nodes, content, attachments
  ) values (
    v_uid, v_name, coalesce(v_team, ''), v_mod_name, coalesce(v_mod_team, ''),
    v_address, v_match, v_nodes, v_content, v_clean
  )
  returning id into v_id;

  -- 送出後 LINE 通知修改人（見遠端 migration biz_system_change_modifier_inbox_line）
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.biz_system_change_for_me(p_token text)
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
  v_is_admin boolean := false;
  v_can_ask boolean := false;
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
    return json_build_object('ok', true, 'rows', '[]'::json, 'name', '', 'canAskAdmin', false);
  end if;
  v_is_admin := (v_team = '行政管理部');
  v_can_ask := v_is_admin or (v_title = '營業處經理');
  return json_build_object(
    'ok', true,
    'name', v_name,
    'canAskAdmin', v_can_ask,
    'rows', coalesce((
      select json_agg(public.biz_system_change_row_json(a) order by a.created_at desc, a.id desc)
      from (
        select * from public.biz_system_change
        where status = 'pending'
          and (v_is_admin or trim(modifier_name) = v_name)
        order by created_at desc, id desc
        limit 100
      ) a
    ), '[]'::json)
  );
end;
$$;

create or replace function public.biz_system_change_ask_admin(p_token text, p_id bigint)
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
  v_row public.biz_system_change%rowtype;
  v_nodes_txt text := '';
  v_msg text;
  v_line json;
  v_note text;
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
  if not (v_team = '行政管理部' or v_title = '營業處經理') then
    return json_build_object('ok', false, 'error', '僅處長或行政可請管理員修改');
  end if;

  select * into v_row from public.biz_system_change where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆通報');
  end if;
  if v_row.status <> 'pending' then
    return json_build_object('ok', false, 'error', '此案件目前無法請管理員修改');
  end if;
  if v_team <> '行政管理部' and trim(v_row.modifier_name) <> v_name then
    return json_build_object('ok', false, 'error', '只能請管理員處理指派給你的案件');
  end if;

  select string_agg(x, '、') into v_nodes_txt
  from jsonb_array_elements_text(coalesce(v_row.nodes, '[]'::jsonb)) t(x);

  v_msg := format(
    E'🛠️ 系統欄位需管理員協助修改\n%s（%s）請黃怡婷協助修改：\n地址：%s\n媒合編號：%s\n節點：%s\n內容：%s\n請至工具箱「系統欄位更改通報後台」處理。',
    v_name,
    coalesce(nullif(v_team, ''), '未填處別'),
    v_row.address,
    v_row.match_no,
    coalesce(v_nodes_txt, ''),
    left(v_row.content, 800)
  );
  v_line := public.admin_points_line_push('黃怡婷', v_msg);

  v_note := format('已請管理員（黃怡婷）協助｜%s｜%s',
    v_name,
    to_char(timezone('Asia/Taipei', now()), 'YYYY/MM/DD HH24:MI')
  );
  update public.biz_system_change
     set admin_note = case
           when trim(coalesce(admin_note, '')) = '' then v_note
           when position(v_note in admin_note) > 0 then admin_note
           else left(admin_note || E'\n' || v_note, 1000)
         end
   where id = p_id
  returning * into v_row;

  return json_build_object(
    'ok', true,
    'row', public.biz_system_change_row_json(v_row),
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$$;

create or replace function public.biz_system_change_mark_done(p_token text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_name text;
  v_row public.biz_system_change%rowtype;
  v_line json;
  v_msg text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username))
    into v_name
  from public.toolbox_accounts a where a.id = v_uid;
  if coalesce(v_name, '') = '' then
    return json_build_object('ok', false, 'error', '帳號沒有姓名');
  end if;

  select * into v_row from public.biz_system_change where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆通報');
  end if;
  if trim(v_row.modifier_name) <> v_name then
    return json_build_object('ok', false, 'error', '只有指定的修改人可以按已修改完畢');
  end if;
  if v_row.status = 'done' then
    return json_build_object('ok', true, 'row', public.biz_system_change_row_json(v_row), 'already', true);
  end if;
  if v_row.status <> 'pending' then
    return json_build_object('ok', false, 'error', '此案件目前無法標記完成');
  end if;

  update public.biz_system_change
     set status = 'done',
         handled_at = now(),
         handled_by = v_name,
         admin_note = case
           when trim(coalesce(admin_note, '')) = '' then '修改人已標記完成'
           else admin_note
         end
   where id = p_id
  returning * into v_row;

  v_msg := format(
    E'✅ 系統欄位已修改完畢\n您通報的案件已由 %s 標記完成。\n地址：%s\n媒合編號：%s',
    v_name, v_row.address, v_row.match_no
  );
  v_line := public.admin_points_line_push(v_row.author_name, v_msg);

  return json_build_object(
    'ok', true,
    'row', public.biz_system_change_row_json(v_row),
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$$;

create or replace function public.biz_system_change_mine(p_token text)
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
      select json_agg(public.biz_system_change_row_json(a) order by a.created_at desc, a.id desc)
      from (
        select * from public.biz_system_change
        where user_id = v_uid
        order by created_at desc, id desc
        limit 50
      ) a
    ), '[]'::json)
  );
end;
$$;

create or replace function public.biz_system_change_admin_list(p_secret text, p_status text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s text := trim(coalesce(p_status, ''));
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  return json_build_object(
    'ok', true,
    'counts', (
      select json_build_object(
        'all', count(*),
        'pending', count(*) filter (where status = 'pending'),
        'done', count(*) filter (where status = 'done'),
        'rejected', count(*) filter (where status = 'rejected')
      ) from public.biz_system_change
    ),
    'rows', coalesce((
      select json_agg(public.biz_system_change_row_json(a) order by a.created_at desc, a.id desc)
      from (
        select * from public.biz_system_change
        where v_s = '' or status = v_s
        order by created_at desc, id desc
        limit 500
      ) a
    ), '[]'::json)
  );
end;
$$;

create or replace function public.biz_system_change_admin_update(
  p_secret text,
  p_id bigint,
  p_status text,
  p_admin_note text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := trim(coalesce(p_status, ''));
  v_note text := left(trim(coalesce(p_admin_note, '')), 1000);
  v_row public.biz_system_change%rowtype;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if v_status not in ('pending', 'done', 'rejected') then
    return json_build_object('ok', false, 'error', '狀態不正確');
  end if;
  update public.biz_system_change
     set status = v_status,
         admin_note = v_note,
         handled_at = case when v_status = 'pending' then null else now() end
   where id = p_id
  returning * into v_row;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆通報');
  end if;
  return json_build_object('ok', true, 'row', public.biz_system_change_row_json(v_row));
end;
$$;

grant execute on function public.biz_system_change_prepare_upload(text, text) to anon, authenticated;
grant execute on function public.biz_system_change_managers(text) to anon, authenticated;
grant execute on function public.biz_system_change_submit(text, jsonb) to anon, authenticated;
grant execute on function public.biz_system_change_for_me(text) to anon, authenticated;
grant execute on function public.biz_system_change_mark_done(text, bigint) to anon, authenticated;
grant execute on function public.biz_system_change_ask_admin(text, bigint) to anon, authenticated;
grant execute on function public.biz_system_change_mine(text) to anon, authenticated;
create or replace function public.biz_system_change_admin_delete(p_secret text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := p_id;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if v_id is null or v_id <= 0 then
    return json_build_object('ok', false, 'error', '案件編號錯誤');
  end if;
  delete from public.biz_system_change where id = v_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆通報');
  end if;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.biz_system_change_admin_list(text, text) to anon, authenticated;
grant execute on function public.biz_system_change_admin_update(text, bigint, text, text) to anon, authenticated;
grant execute on function public.biz_system_change_admin_delete(text, bigint) to anon, authenticated;
