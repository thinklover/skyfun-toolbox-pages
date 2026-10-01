-- 註銷物件申請：全員可見列表、簽呈上傳、勾選已完成
-- 檔案上傳／簽名網址／刪除由 edge function object-cancel 處理（service role）

alter table public.object_cancel_requests
  add column if not exists done_by uuid references public.toolbox_accounts(id) on delete set null,
  add column if not exists done_by_name text not null default '';

create table if not exists public.object_cancel_files (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.object_cancel_requests(id) on delete cascade,
  user_id uuid references public.toolbox_accounts(id) on delete set null,
  user_name text not null default '',
  file_path text not null,
  file_name text not null,
  mime text not null,
  size_bytes int not null,
  created_at timestamptz not null default now()
);
create index if not exists object_cancel_files_request_idx on public.object_cancel_files (request_id, created_at);
alter table public.object_cancel_files enable row level security;
revoke all on public.object_cancel_files from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('object-cancel', 'object-cancel', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.object_cancel_items_json(p_query text, p_status text, p_limit int)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select r.id, r.username, r.user_name as "userName", r.team, r.dept, r.applicant, r.agent_name as "agentName",
      r.region, r.object_type as "objectType", r.contract_status as "contractStatus", r.lease_start as "leaseStart",
      r.lease_end as "leaseEnd", r.address, r.note, r.taker_company as "takerCompany", r.taker_agent as "takerAgent",
      r.status, r.admin_note as "adminNote", r.handled_at as "handledAt", r.done_by_name as "doneByName",
      r.created_at as "createdAt",
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

create or replace function public.object_cancel_counts_json()
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'all', count(*), 'pending', count(*) filter (where status = 'pending'),
    'done', count(*) filter (where status = 'done'), 'rejected', count(*) filter (where status = 'rejected'))
  from public.object_cancel_requests;
$$;
revoke all on function public.object_cancel_counts_json() from public, anon, authenticated;

create or replace function public.object_cancel_list(p_token text, p_query text default '', p_status text default '', p_limit int default 500)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  return json_build_object('ok', true, 'counts', object_cancel_counts_json(),
    'items', object_cancel_items_json(p_query, p_status, p_limit));
end; $$;

create or replace function public.object_cancel_set_done(p_token text, p_id bigint, p_done boolean)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_row public.object_cancel_requests%rowtype;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;
  update public.object_cancel_requests set
    status = case when p_done then 'done' else 'pending' end,
    handled_at = case when p_done then now() else null end,
    done_by = case when p_done then v_uid else null end,
    done_by_name = case when p_done then coalesce(nullif(v_acc.name, ''), v_acc.username, '') else '' end
  where id = p_id
  returning * into v_row;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆申請'); end if;
  return json_build_object('ok', true, 'status', v_row.status, 'handledAt', v_row.handled_at, 'doneByName', v_row.done_by_name);
end; $$;

create or replace function public.object_cancel_admin_list(p_secret text, p_query text default '', p_status text default '', p_limit int default 500)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true, 'counts', object_cancel_counts_json(),
    'items', object_cancel_items_json(p_query, p_status, p_limit));
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
    handled_at = case when p_status = 'pending' then null when status = p_status then handled_at else now() end,
    done_by = case when p_status = 'done' and status = 'done' then done_by else null end,
    done_by_name = case when p_status = 'done' and status = 'done' then done_by_name when p_status = 'done' then '後台' else '' end
  where id = p_id
  returning * into v_row;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆申請'); end if;
  return json_build_object('ok', true, 'status', v_row.status, 'handledAt', v_row.handled_at);
end; $$;

-- 刪除改由 edge function 處理（需同步刪除儲存空間的簽呈檔案）
drop function if exists public.object_cancel_admin_delete(text, bigint);
drop function if exists public.object_cancel_my(text);

grant execute on function public.object_cancel_list(text, text, text, int) to anon, authenticated;
grant execute on function public.object_cancel_set_done(text, bigint, boolean) to anon, authenticated;
grant execute on function public.object_cancel_admin_list(text, text, text, int) to anon, authenticated;
grant execute on function public.object_cancel_admin_update(text, bigint, text, text) to anon, authenticated;
