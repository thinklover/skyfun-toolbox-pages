-- 帳號後台：顯示 LINE 綁定狀態 + 強制下次登入綁定
-- 2026-10-24

alter table public.toolbox_accounts
  add column if not exists force_line_bind boolean not null default false;

comment on column public.toolbox_accounts.force_line_bind is
  '後台強制：下次進入工具箱必須完成 LINE 綁定（不可略過）';

-- 綁定成功後自動解除強制標記
create or replace function public.line_bindings_clear_force()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.toolbox_accounts
  set force_line_bind = false
  where id = new.user_id and force_line_bind = true;
  return new;
end;
$$;

drop trigger if exists trg_line_bindings_clear_force on public.line_bindings;
create trigger trg_line_bindings_clear_force
  after insert or update of line_user_id on public.line_bindings
  for each row execute function public.line_bindings_clear_force();

create or replace function public.line_my_binding(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_b public.line_bindings%rowtype;
  v_force boolean := false;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  select coalesce(force_line_bind, false) into v_force
  from public.toolbox_accounts where id = v_uid;
  select * into v_b from public.line_bindings where user_id = v_uid;
  if not found then
    return json_build_object('ok', true, 'bound', false, 'forceBind', coalesce(v_force, false));
  end if;
  return json_build_object(
    'ok', true,
    'bound', true,
    'forceBind', coalesce(v_force, false),
    'lineName', v_b.line_name,
    'boundAt', v_b.bound_at,
    'notifyObjectCancel', v_b.notify_object_cancel
  );
end;
$$;

create or replace function public.toolbox_admin_set_force_line_bind(
  p_secret text,
  p_user_id uuid,
  p_on boolean,
  p_unbind boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  select name into v_name from public.toolbox_accounts where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到帳號');
  end if;
  if coalesce(p_unbind, false) then
    delete from public.line_bindings where user_id = p_user_id;
    delete from public.line_bind_codes where user_id = p_user_id;
  end if;
  update public.toolbox_accounts
  set force_line_bind = coalesce(p_on, false)
  where id = p_user_id;
  return json_build_object(
    'ok', true,
    'forceLineBind', coalesce(p_on, false),
    'unbound', coalesce(p_unbind, false),
    'message', case
      when coalesce(p_on, false) and coalesce(p_unbind, false)
        then '已解除現有綁定，並設為下次登入強制綁 LINE'
      when coalesce(p_on, false)
        then '已設為下次登入強制綁 LINE'
      else '已取消強制綁 LINE'
    end
  );
end;
$$;

grant execute on function public.toolbox_admin_set_force_line_bind(text, uuid, boolean, boolean)
  to anon, authenticated;

-- 帳號列表附帶 LINE 綁定資訊
create or replace function public.toolbox_admin_list(p_secret text, p_status text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not toolbox_check_admin(p_secret) then
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
          a.id, a.username, a.name, a.team, a.status, a.note,
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

grant execute on function public.toolbox_admin_list(text, text) to anon, authenticated;
grant execute on function public.line_my_binding(text) to anon, authenticated;
