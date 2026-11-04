-- 帳號後台：職稱（可手動改、可從公司系統同步寫入）

create or replace function public.toolbox_admin_list(p_secret text, p_status text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not toolbox_check_accounts_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  return json_build_object(
    'ok', true,
    'summary', (
      select json_build_object(
        'online', count(*) filter (where status = 'active' and last_active > now() - interval '15 minutes'),
        'active24h', count(*) filter (where status = 'active' and last_active > now() - interval '24 hours'),
        'withSession', (
          select count(distinct s.user_id) from public.toolbox_sessions s
          where s.expires_at > now()
        ),
        'fail15m', (
          select count(*) from public.toolbox_login_events e
          where e.ok = false and e.created_at > now() - interval '15 minutes'
        ),
        'abnormal15m', (
          select count(distinct coalesce(e.user_id::text, e.name))
          from public.toolbox_login_events e
          where e.ok = false and e.created_at > now() - interval '15 minutes'
            and e.detail in ('bad_password', 'disabled', 'rejected', 'pending')
        )
      )
      from public.toolbox_accounts
    ),
    'users', coalesce((
      select json_agg(row_to_json(x))
      from (
        select
          a.id, a.username, a.name, a.team,
          a.job_title as "jobTitle",
          a.status, a.note,
          a.admin_qa_double_points as "adminQaDoublePoints",
          a.admin_qa_can_set_quality as "adminQaCanSetQuality",
          a.force_line_bind as "forceLineBind",
          a.created_at as "createdAt",
          a.reviewed_at as "reviewedAt",
          a.last_active as "lastActive",
          (a.status = 'active' and a.last_active is not null and a.last_active > now() - interval '15 minutes') as "isOnline",
          exists (
            select 1 from public.toolbox_sessions s
            where s.user_id = a.id and s.expires_at > now()
          ) as "hasSession",
          (
            select count(*)::int from public.toolbox_login_events e
            where e.user_id = a.id and e.ok = false and e.detail = 'bad_password'
              and e.created_at > now() - interval '15 minutes'
          ) as "failCount15m",
          (
            select e.ok from public.toolbox_login_events e
            where e.user_id = a.id and e.detail in ('login_ok', 'bad_password', 'disabled', 'rejected', 'pending')
            order by e.created_at desc limit 1
          ) as "lastLoginOk",
          (
            select e.detail from public.toolbox_login_events e
            where e.user_id = a.id and e.detail in ('login_ok', 'bad_password', 'disabled', 'rejected', 'pending')
            order by e.created_at desc limit 1
          ) as "lastLoginDetail",
          (
            select e.created_at from public.toolbox_login_events e
            where e.user_id = a.id and e.detail in ('login_ok', 'bad_password', 'disabled', 'rejected', 'pending')
            order by e.created_at desc limit 1
          ) as "lastLoginAt",
          exists (
            select 1 from public.line_bindings b where b.user_id = a.id
          ) as "lineBound",
          (
            select b.line_name from public.line_bindings b where b.user_id = a.id limit 1
          ) as "lineName",
          (
            select b.bound_at from public.line_bindings b where b.user_id = a.id limit 1
          ) as "lineBoundAt"
        from public.toolbox_accounts a
        where p_status is null or p_status = '' or a.status = p_status
        order by
          (a.status = 'active' and a.last_active is not null and a.last_active > now() - interval '15 minutes') desc,
          a.last_active desc nulls last,
          a.created_at desc
        limit 500
      ) x
    ), '[]'::json)
  );
end;
$$;

create or replace function public.toolbox_admin_set_job_title(
  p_secret text,
  p_user_id uuid,
  p_job_title text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if not toolbox_check_accounts_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  v_title := left(trim(coalesce(p_job_title, '')), 40);
  update public.toolbox_accounts
     set job_title = v_title
   where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到帳號');
  end if;
  return json_build_object('ok', true, 'jobTitle', v_title);
end;
$$;

-- p_items: [{ "id": "uuid", "jobTitle": "組長" }, ...]
create or replace function public.toolbox_admin_sync_job_titles(
  p_secret text,
  p_items json,
  p_overwrite boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item json;
  v_id uuid;
  v_title text;
  v_updated int := 0;
  v_skipped int := 0;
  v_missing int := 0;
begin
  if not toolbox_check_accounts_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_items is null or json_typeof(p_items) <> 'array' then
    return json_build_object('ok', false, 'error', '格式錯誤');
  end if;

  for v_item in select * from json_array_elements(p_items)
  loop
    begin
      v_id := nullif(trim(coalesce(v_item->>'id', '')), '')::uuid;
    exception when others then
      v_id := null;
    end;
    v_title := left(trim(coalesce(v_item->>'jobTitle', v_item->>'job_title', '')), 40);
    if v_id is null or v_title = '' then
      v_missing := v_missing + 1;
      continue;
    end if;
    update public.toolbox_accounts a
       set job_title = v_title
     where a.id = v_id
       and (p_overwrite or coalesce(a.job_title, '') = '');
    if found then
      v_updated := v_updated + 1;
    else
      if exists (select 1 from public.toolbox_accounts where id = v_id) then
        v_skipped := v_skipped + 1;
      else
        v_missing := v_missing + 1;
      end if;
    end if;
  end loop;

  return json_build_object(
    'ok', true,
    'updated', v_updated,
    'skipped', v_skipped,
    'missing', v_missing
  );
end;
$$;

grant execute on function public.toolbox_admin_list(text, text) to anon, authenticated;
grant execute on function public.toolbox_admin_set_job_title(text, uuid, text) to anon, authenticated;
grant execute on function public.toolbox_admin_sync_job_titles(text, json, boolean) to anon, authenticated;
