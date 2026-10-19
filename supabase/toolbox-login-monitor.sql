-- 帳號後台：登入狀態（線上／最近活動／失敗次數）＋異常登入 LINE 通知簡為倢

create table if not exists public.toolbox_login_alert_sent (
  alert_key text primary key,
  last_sent_at timestamptz not null default now()
);
alter table public.toolbox_login_alert_sent enable row level security;
revoke all on public.toolbox_login_alert_sent from public, anon, authenticated;

create index if not exists toolbox_login_events_created_idx
  on public.toolbox_login_events (created_at desc);
create index if not exists toolbox_login_events_user_created_idx
  on public.toolbox_login_events (user_id, created_at desc);

/** 推播給簡為倢（需已綁定星鴻萬能小幫手）；同 key 30 分鐘內不重送 */
create or replace function public.toolbox_notify_login_alert(
  p_alert_key text,
  p_msg text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := left(trim(coalesce(p_alert_key, '')), 200);
  v_prev timestamptz;
  v_push json;
begin
  if v_key = '' or coalesce(trim(p_msg), '') = '' then
    return json_build_object('ok', false, 'error', 'empty');
  end if;
  select last_sent_at into v_prev from public.toolbox_login_alert_sent where alert_key = v_key;
  if v_prev is not null and v_prev > now() - interval '30 minutes' then
    return json_build_object('ok', true, 'skipped', true, 'reason', 'debounce');
  end if;
  insert into public.toolbox_login_alert_sent(alert_key, last_sent_at)
  values (v_key, now())
  on conflict (alert_key) do update set last_sent_at = now();
  v_push := public.admin_points_line_push('簡為倢', p_msg);
  return json_build_object(
    'ok', true,
    'skipped', false,
    'recipients', coalesce((v_push->>'recipients')::int, 0),
    'error', coalesce(v_push->>'error', '')
  );
exception when others then
  return json_build_object('ok', false, 'error', SQLERRM);
end;
$$;
revoke all on function public.toolbox_notify_login_alert(text, text) from public, anon, authenticated;

create or replace function public.toolbox_enter(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.toolbox_accounts%rowtype;
  v_token text;
  v_name text;
  v_pw text;
  v_fail int := 0;
  v_ok_hour int := 0;
  v_label text;
begin
  v_name := trim(coalesce(p_username, ''));
  if v_name = '' then return json_build_object('ok', false, 'error', '請輸入帳號'); end if;
  if coalesce(p_password, '') = '' then return json_build_object('ok', false, 'error', '請輸入密碼'); end if;

  select * into v_user from public.toolbox_accounts a
  where toolbox_norm(a.username) = toolbox_norm(v_name) limit 1;

  if not found then
    insert into public.toolbox_login_events(user_id, name, team, ok, detail)
    values (null, left(v_name, 80), '', false, 'not_registered');
    return json_build_object('ok', false, 'error', '帳號不存在，請先註冊', 'code', 'not_registered');
  end if;

  v_label := coalesce(nullif(trim(v_user.name), ''), v_user.username);
  v_pw := upper(trim(p_password));

  if not toolbox_verify_password(p_password, v_user.password_hash)
     and not (v_pw = upper(trim(v_user.username))
              and (toolbox_verify_password(v_pw, v_user.password_hash)
                   or toolbox_verify_password(lower(v_pw), v_user.password_hash))) then
    insert into public.toolbox_login_events(user_id, name, team, ok, detail)
    values (v_user.id, v_label, coalesce(v_user.team, ''), false, 'bad_password');
    select count(*)::int into v_fail
    from public.toolbox_login_events
    where user_id = v_user.id and ok = false and detail = 'bad_password'
      and created_at > now() - interval '15 minutes';
    if v_fail >= 5 then
      perform public.toolbox_notify_login_alert(
        'bad_password:' || v_user.id::text,
        format(
          E'⚠️ 工具箱異常登入\n帳號：%s\n姓名：%s\n處別：%s\n狀況：15 分鐘內密碼錯誤 %s 次\n時間：%s',
          v_user.username, v_label, coalesce(nullif(v_user.team, ''), '—'),
          v_fail, to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI')
        )
      );
    end if;
    return json_build_object('ok', false, 'error', '帳號或密碼錯誤', 'code', 'bad_password');
  end if;

  if v_user.status = 'pending' then
    insert into public.toolbox_login_events(user_id, name, team, ok, detail)
    values (v_user.id, v_label, coalesce(v_user.team, ''), false, 'pending');
    perform public.toolbox_notify_login_alert(
      'pending:' || v_user.id::text,
      format(
        E'⚠️ 工具箱異常登入\n帳號：%s\n姓名：%s\n處別：%s\n狀況：審核中帳號嘗試登入\n時間：%s',
        v_user.username, v_label, coalesce(nullif(v_user.team, ''), '—'),
        to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI')
      )
    );
    return json_build_object('ok', false, 'error', '帳號審核中，核准後才能登入', 'code', 'pending');
  end if;

  if v_user.status = 'rejected' then
    insert into public.toolbox_login_events(user_id, name, team, ok, detail)
    values (v_user.id, v_label, coalesce(v_user.team, ''), false, 'rejected');
    perform public.toolbox_notify_login_alert(
      'rejected:' || v_user.id::text,
      format(
        E'⚠️ 工具箱異常登入\n帳號：%s\n姓名：%s\n處別：%s\n狀況：已拒絕帳號嘗試登入\n時間：%s',
        v_user.username, v_label, coalesce(nullif(v_user.team, ''), '—'),
        to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI')
      )
    );
    return json_build_object('ok', false, 'error', '註冊未通過，請洽管理員', 'code', 'rejected');
  end if;

  if v_user.status = 'disabled' then
    insert into public.toolbox_login_events(user_id, name, team, ok, detail)
    values (v_user.id, v_label, coalesce(v_user.team, ''), false, 'disabled');
    perform public.toolbox_notify_login_alert(
      'disabled:' || v_user.id::text,
      format(
        E'⚠️ 工具箱異常登入\n帳號：%s\n姓名：%s\n處別：%s\n狀況：已停用帳號嘗試登入\n時間：%s',
        v_user.username, v_label, coalesce(nullif(v_user.team, ''), '—'),
        to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI')
      )
    );
    return json_build_object('ok', false, 'error', '此帳號已停用', 'code', 'disabled');
  end if;

  select count(*)::int into v_fail
  from public.toolbox_login_events
  where user_id = v_user.id and ok = false and detail = 'bad_password'
    and created_at > now() - interval '15 minutes';

  delete from public.toolbox_sessions where user_id = v_user.id;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.toolbox_sessions(token, user_id, expires_at)
  values (v_token, v_user.id, now() + interval '30 days');
  update public.toolbox_accounts set last_active = now() where id = v_user.id;
  insert into public.toolbox_login_events(user_id, name, team, ok, detail)
  values (v_user.id, v_label, coalesce(v_user.team, ''), true, 'login_ok');

  if v_fail >= 3 then
    perform public.toolbox_notify_login_alert(
      'success_after_fail:' || v_user.id::text,
      format(
        E'⚠️ 工具箱異常登入\n帳號：%s\n姓名：%s\n處別：%s\n狀況：15 分鐘內密碼錯誤 %s 次後登入成功\n時間：%s',
        v_user.username, v_label, coalesce(nullif(v_user.team, ''), '—'),
        v_fail, to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI')
      )
    );
  end if;

  -- 疑似多人共用帳號：1 小時內成功登入達 4 次（含本次）
  select count(*)::int into v_ok_hour
  from public.toolbox_login_events
  where user_id = v_user.id and ok = true and detail = 'login_ok'
    and created_at > now() - interval '1 hour';
  if v_ok_hour >= 4 then
    perform public.toolbox_notify_login_alert(
      'frequent_login:' || v_user.id::text,
      format(
        E'⚠️ 工具箱登入過頻（疑似共用帳號）\n帳號：%s\n姓名：%s\n處別：%s\n狀況：1 小時內成功登入 %s 次\n時間：%s',
        v_user.username, v_label, coalesce(nullif(v_user.team, ''), '—'),
        v_ok_hour, to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI')
      )
    );
  end if;

  return json_build_object('ok', true, 'token', v_token, 'user', public.toolbox_user_payload(v_user));
end;
$$;

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
          ) as "lastLoginAt"
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

create or replace function public.toolbox_admin_login_events(
  p_secret text,
  p_limit int default 50
)
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
    'events', coalesce((
      select json_agg(row_to_json(x))
      from (
        select
          e.id,
          e.user_id as "userId",
          e.name,
          e.team,
          e.ok,
          e.detail,
          e.created_at as "createdAt",
          a.username,
          a.status as "accountStatus"
        from public.toolbox_login_events e
        left join public.toolbox_accounts a on a.id = e.user_id
        where e.detail in ('login_ok', 'bad_password', 'disabled', 'rejected', 'pending', 'not_registered')
        order by e.created_at desc
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) x
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.toolbox_enter(text, text) to anon, authenticated;
grant execute on function public.toolbox_admin_list(text, text) to anon, authenticated;
grant execute on function public.toolbox_admin_login_events(text, int) to anon, authenticated;
