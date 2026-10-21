-- 有人申請註冊工具箱時，LINE 通知簡為倢（沿用 toolbox_notify_login_alert）

create or replace function public.toolbox_register(p_username text, p_password text, p_name text default '', p_team text default '')
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user text := upper(regexp_replace(coalesce(p_username, ''), '\s', '', 'g'));
  v_name text := regexp_replace(coalesce(p_name, ''), '\s', '', 'g');
  v_team text := trim(coalesce(p_team, ''));
  v_hash text;
  v_id uuid;
begin
  if not public.toolbox_tw_id_ok(v_user) then
    return json_build_object('ok', false, 'error', '帳號請輸入身分證字號（與公司系統相同）');
  end if;
  if upper(trim(coalesce(p_password, ''))) <> v_user then
    return json_build_object('ok', false, 'error', '密碼請輸入身分證字號（與公司系統相同）');
  end if;
  if not public.toolbox_real_name_ok(v_name) then
    return json_build_object('ok', false, 'error', '姓名請填本名（與身分證相同）');
  end if;
  if v_team = '' then return json_build_object('ok', false, 'error', '請選擇處別'); end if;
  if exists (select 1 from public.toolbox_accounts a where toolbox_norm(a.username) = toolbox_norm(v_user)) then
    return json_build_object('ok', false, 'error', '此帳號已被註冊');
  end if;
  v_hash := toolbox_hash_password(v_user);
  insert into public.toolbox_accounts(username, password_hash, name, team, status, identity_key)
  values (v_user, v_hash, v_name, v_team, 'pending', md5(v_user || v_hash))
  returning id into v_id;
  insert into public.toolbox_login_events(user_id, name, team, ok, detail)
  values (v_id, v_name, v_team, true, 'register_pending');
  perform public.toolbox_notify_login_alert(
    'register:' || v_id::text,
    format(
      E'🆕 工具箱新註冊申請\n帳號：%s\n姓名：%s\n處別：%s\n狀態：待核准\n時間：%s\n請至帳號後台核准。',
      v_user, v_name, coalesce(nullif(v_team, ''), '—'),
      to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI')
    )
  );
  return json_build_object('ok', true, 'message', '註冊成功，請等待管理員核准後再登入', 'status', 'pending');
end;
$$;
grant execute on function public.toolbox_register(text, text, text, text) to anon, authenticated;
