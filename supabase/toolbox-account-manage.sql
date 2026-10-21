-- 帳號管理補強：
-- 1) 後台「完全刪除帳號」toolbox_admin_delete_user（停用只是擋登入，帳號還在會擋重新註冊）
-- 2) 使用者「修改密碼」toolbox_change_password（密碼維持身分證字號，與現行實名規定一致）
-- 3) 登入頁「忘記密碼」toolbox_reset_password（帳號＋姓名驗證 → 密碼重設回身分證字號 → 直接登入）

create or replace function public.toolbox_admin_delete_user(p_secret text, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_user public.toolbox_accounts%rowtype;
begin
  if not toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  select * into v_user from public.toolbox_accounts where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到帳號');
  end if;
  delete from public.toolbox_accounts where id = p_user_id;
  return json_build_object('ok', true, 'username', v_user.username, 'name', v_user.name,
    'message', '已完全刪除帳號 ' || v_user.username || '（' || coalesce(v_user.name, '') || '），該身分證可重新註冊');
end;
$$;
grant execute on function public.toolbox_admin_delete_user(text, uuid) to anon, authenticated;

create or replace function public.toolbox_change_password(p_token text, p_current text, p_new text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sess public.toolbox_sessions%rowtype;
  v_user public.toolbox_accounts%rowtype;
  v_new text := upper(regexp_replace(coalesce(p_new, ''), '\s', '', 'g'));
  v_hash text;
begin
  if coalesce(trim(p_token), '') = '' then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_sess from public.toolbox_sessions where token = trim(p_token) and expires_at >= now();
  if not found then return json_build_object('ok', false, 'error', '登入已失效，請重新登入'); end if;
  select * into v_user from public.toolbox_accounts where id = v_sess.user_id for update;
  if not found or v_user.status <> 'active' then return json_build_object('ok', false, 'error', '帳號未核准或已停用'); end if;
  if coalesce(p_current, '') = '' then return json_build_object('ok', false, 'error', '請輸入目前密碼'); end if;
  if not toolbox_verify_password(p_current, v_user.password_hash)
     and not (upper(trim(p_current)) = upper(trim(v_user.username))
              and (toolbox_verify_password(upper(trim(p_current)), v_user.password_hash)
                   or toolbox_verify_password(lower(trim(v_user.username)), v_user.password_hash))) then
    insert into public.toolbox_login_events(user_id, name, team, ok, detail)
    values (v_user.id, v_user.name, v_user.team, false, 'change_password_bad_current');
    return json_build_object('ok', false, 'error', '目前密碼不正確');
  end if;
  if not public.toolbox_tw_id_ok(v_user.username) then
    return json_build_object('ok', false, 'error', '您的帳號不是身分證字號，請洽管理員協助修改');
  end if;
  if v_new <> upper(trim(v_user.username)) then
    return json_build_object('ok', false, 'error', '新密碼請輸入身分證字號（與公司系統相同）');
  end if;
  v_hash := public.toolbox_hash_password(v_new);
  update public.toolbox_accounts
  set password_hash = v_hash, identity_key = md5(upper(trim(v_user.username)) || v_hash)
  where id = v_user.id;
  insert into public.toolbox_login_events(user_id, name, team, ok, detail)
  values (v_user.id, v_user.name, v_user.team, true, 'password_change');
  return json_build_object('ok', true, 'message', '密碼已更新，下次登入請用身分證字號');
end;
$$;
grant execute on function public.toolbox_change_password(text, text, text) to anon, authenticated;

create or replace function public.toolbox_reset_password(p_username text, p_name text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.toolbox_accounts%rowtype;
  v_name_in text := regexp_replace(coalesce(p_name, ''), '\s', '', 'g');
  v_id text;
  v_hash text;
  v_token text;
  v_fails int;
begin
  select * into v_user from public.toolbox_accounts a
  where toolbox_norm(a.username) = toolbox_norm(coalesce(p_username, '')) limit 1;
  if not found then
    return json_build_object('ok', false, 'error', '帳號或姓名不正確，請再確認');
  end if;
  select count(*) into v_fails from public.toolbox_login_events e
  where e.user_id = v_user.id and e.detail = 'password_reset_fail'
    and e.created_at > now() - interval '15 minutes';
  if v_fails >= 5 then
    return json_build_object('ok', false, 'error', '嘗試次數過多，請 15 分鐘後再試，或洽管理員協助');
  end if;
  if v_name_in = '' or regexp_replace(coalesce(v_user.name, ''), '\s', '', 'g') <> v_name_in then
    insert into public.toolbox_login_events(user_id, name, team, ok, detail)
    values (v_user.id, v_user.name, v_user.team, false, 'password_reset_fail');
    return json_build_object('ok', false, 'error', '帳號或姓名不正確，請再確認');
  end if;
  if v_user.status = 'pending' then return json_build_object('ok', false, 'error', '帳號審核中，核准後才能登入'); end if;
  if v_user.status = 'rejected' then return json_build_object('ok', false, 'error', '註冊未通過，請洽管理員'); end if;
  if v_user.status = 'disabled' then return json_build_object('ok', false, 'error', '此帳號已停用，請洽管理員'); end if;
  v_id := upper(trim(v_user.username));
  if not public.toolbox_tw_id_ok(v_id) then
    return json_build_object('ok', false, 'error', '您的帳號不是身分證字號，請洽管理員協助重設密碼');
  end if;
  v_hash := public.toolbox_hash_password(v_id);
  update public.toolbox_accounts
  set password_hash = v_hash, identity_key = md5(v_id || v_hash), last_active = now()
  where id = v_user.id;
  delete from public.toolbox_sessions where user_id = v_user.id;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.toolbox_sessions(token, user_id, expires_at)
  values (v_token, v_user.id, now() + interval '30 days');
  insert into public.toolbox_login_events(user_id, name, team, ok, detail)
  values (v_user.id, v_user.name, v_user.team, true, 'password_reset');
  select * into v_user from public.toolbox_accounts where id = v_user.id;
  return json_build_object('ok', true, 'token', v_token, 'user', public.toolbox_user_payload(v_user),
    'message', '密碼已重設為身分證字號，已直接登入');
end;
$$;
grant execute on function public.toolbox_reset_password(text, text) to anon, authenticated;
