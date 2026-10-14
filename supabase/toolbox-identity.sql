-- 工具箱帳號實名化：帳號、密碼都要是身分證字號（與公司系統相同），姓名要是本名。
-- 不符合的帳號登入後會被要求更新（toolbox_update_identity），更新前不能使用工具箱。
-- identity_key = md5(帳號 || password_hash)：記住「密碼等於帳號」已驗證過，避免每次都跑 bcrypt。

alter table public.toolbox_accounts add column if not exists identity_key text;

-- 身分證字號／新式居留證號（第二碼 1、2、8、9）含檢查碼
create or replace function public.toolbox_tw_id_ok(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  v text := upper(trim(coalesce(p, '')));
  codes constant int[] := array[10,11,12,13,14,15,16,17,34,18,19,20,21,22,35,23,24,25,26,27,28,29,32,30,31,33];
  n int;
  s int;
begin
  if v !~ '^[A-Z][1289][0-9]{8}$' then return false; end if;
  n := codes[ascii(substr(v, 1, 1)) - 64];
  s := n / 10 + (n % 10) * 9;
  for i in 2..9 loop
    s := s + substr(v, i, 1)::int * (10 - i);
  end loop;
  return (s + substr(v, 10, 1)::int) % 10 = 0;
end;
$$;

-- 中文本名 2–4 字；原住民等姓名可用「·」分段
create or replace function public.toolbox_real_name_ok(p text)
returns boolean
language sql
immutable
as $$
  select trim(coalesce(p, '')) ~ '^[一-鿿]{2,4}$'
      or trim(coalesce(p, '')) ~ '^[一-鿿]{1,10}([·‧・．][一-鿿]{1,10})+$'
$$;

-- 回傳待補項目：'id'（帳號或密碼不是身分證字號）、'name'（姓名不是本名）
create or replace function public.toolbox_identity_issues(a public.toolbox_accounts)
returns text[]
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := upper(trim(coalesce(a.username, '')));
  v_issues text[] := '{}';
begin
  if not public.toolbox_tw_id_ok(v_id) then
    v_issues := array['id'];
  elsif a.identity_key is distinct from md5(v_id || coalesce(a.password_hash, '')) then
    if public.toolbox_verify_password(v_id, a.password_hash) or public.toolbox_verify_password(lower(v_id), a.password_hash) then
      update public.toolbox_accounts set identity_key = md5(v_id || coalesce(a.password_hash, '')) where id = a.id;
    else
      v_issues := array['id'];
    end if;
  end if;
  if not public.toolbox_real_name_ok(a.name) then
    v_issues := v_issues || 'name'::text;
  end if;
  return v_issues;
end;
$$;

create or replace function public.toolbox_user_payload(a public.toolbox_accounts)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_issues text[] := public.toolbox_identity_issues(a);
begin
  return json_build_object(
    'id', a.id, 'username', a.username,
    'name', coalesce(nullif(a.name, ''), a.username),
    'role', a.role, 'status', a.status, 'team', coalesce(a.team, ''),
    'needsIdentity', cardinality(v_issues) > 0,
    'identityIssues', to_json(v_issues));
end;
$$;

revoke all on function public.toolbox_identity_issues(public.toolbox_accounts) from public, anon, authenticated;
revoke all on function public.toolbox_user_payload(public.toolbox_accounts) from public, anon, authenticated;

create or replace function public.toolbox_enter(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_user public.toolbox_accounts%rowtype; v_token text; v_name text; v_pw text;
begin
  v_name := trim(coalesce(p_username, ''));
  if v_name = '' then return json_build_object('ok', false, 'error', '請輸入帳號'); end if;
  if coalesce(p_password, '') = '' then return json_build_object('ok', false, 'error', '請輸入密碼'); end if;
  select * into v_user from public.toolbox_accounts a where toolbox_norm(a.username) = toolbox_norm(v_name) limit 1;
  if not found then return json_build_object('ok', false, 'error', '帳號不存在，請先註冊', 'code', 'not_registered'); end if;
  v_pw := upper(trim(p_password));
  -- 密碼就是身分證字號時，英文字母大小寫都接受
  if not toolbox_verify_password(p_password, v_user.password_hash)
     and not (v_pw = upper(trim(v_user.username))
              and (toolbox_verify_password(v_pw, v_user.password_hash) or toolbox_verify_password(lower(v_pw), v_user.password_hash))) then
    return json_build_object('ok', false, 'error', '帳號或密碼錯誤', 'code', 'bad_password');
  end if;
  if v_user.status = 'pending' then return json_build_object('ok', false, 'error', '帳號審核中，核准後才能登入', 'code', 'pending'); end if;
  if v_user.status = 'rejected' then return json_build_object('ok', false, 'error', '註冊未通過，請洽管理員', 'code', 'rejected'); end if;
  if v_user.status = 'disabled' then return json_build_object('ok', false, 'error', '此帳號已停用', 'code', 'disabled'); end if;
  delete from public.toolbox_sessions where user_id = v_user.id;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.toolbox_sessions(token, user_id, expires_at) values (v_token, v_user.id, now() + interval '30 days');
  update public.toolbox_accounts set last_active = now() where id = v_user.id;
  return json_build_object('ok', true, 'token', v_token, 'user', public.toolbox_user_payload(v_user));
end;
$$;

create or replace function public.toolbox_me(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_sess public.toolbox_sessions%rowtype; v_user public.toolbox_accounts%rowtype;
begin
  if coalesce(trim(p_token), '') = '' then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_sess from public.toolbox_sessions where token = trim(p_token);
  if not found or v_sess.expires_at < now() then
    delete from public.toolbox_sessions where token = trim(p_token);
    return json_build_object('ok', false, 'error', '登入已失效', 'code', 'session_invalid');
  end if;
  select * into v_user from public.toolbox_accounts where id = v_sess.user_id;
  if not found or v_user.status <> 'active' then
    delete from public.toolbox_sessions where token = trim(p_token);
    return json_build_object('ok', false, 'error', '帳號未核准或已停用');
  end if;
  update public.toolbox_accounts set last_active = now() where id = v_user.id;
  update public.toolbox_sessions set expires_at = now() + interval '30 days' where token = trim(p_token);
  return json_build_object('ok', true, 'user', public.toolbox_user_payload(v_user));
end;
$$;

create or replace function public.toolbox_set_my_team(p_token text, p_team text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_sess public.toolbox_sessions%rowtype; v_user public.toolbox_accounts%rowtype; v_team text;
begin
  if coalesce(trim(p_token), '') = '' then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_sess from public.toolbox_sessions where token = trim(p_token) and expires_at >= now();
  if not found then return json_build_object('ok', false, 'error', '登入已失效'); end if;
  select * into v_user from public.toolbox_accounts where id = v_sess.user_id for update;
  if not found or v_user.status <> 'active' then return json_build_object('ok', false, 'error', '帳號未核准或已停用'); end if;
  if coalesce(trim(v_user.team), '') <> '' then return json_build_object('ok', false, 'error', '處別已設定，如需修改請洽管理員'); end if;
  v_team := trim(coalesce(p_team, ''));
  if v_team = '' then return json_build_object('ok', false, 'error', '請選擇處別'); end if;
  update public.toolbox_accounts set team = v_team where id = v_user.id;
  v_user.team := v_team;
  return json_build_object('ok', true, 'user', public.toolbox_user_payload(v_user));
end;
$$;

create or replace function public.toolbox_update_identity(p_token text, p_id_no text, p_name text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sess public.toolbox_sessions%rowtype;
  v_user public.toolbox_accounts%rowtype;
  v_id text := upper(regexp_replace(coalesce(p_id_no, ''), '\s', '', 'g'));
  v_name text := regexp_replace(coalesce(p_name, ''), '\s', '', 'g');
  v_hash text;
begin
  if coalesce(trim(p_token), '') = '' then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_sess from public.toolbox_sessions where token = trim(p_token) and expires_at >= now();
  if not found then return json_build_object('ok', false, 'error', '登入已失效，請重新登入'); end if;
  select * into v_user from public.toolbox_accounts where id = v_sess.user_id for update;
  if not found or v_user.status <> 'active' then return json_build_object('ok', false, 'error', '帳號未核准或已停用'); end if;
  if not public.toolbox_real_name_ok(v_name) then
    return json_build_object('ok', false, 'error', '姓名請填本名（與身分證相同）');
  end if;
  if 'id' = any(public.toolbox_identity_issues(v_user)) then
    if not public.toolbox_tw_id_ok(v_id) then
      return json_build_object('ok', false, 'error', '身分證字號格式不正確，請再確認');
    end if;
    if public.toolbox_tw_id_ok(v_user.username) and upper(trim(v_user.username)) <> v_id then
      return json_build_object('ok', false, 'error', '身分證字號和目前的帳號不同，請洽管理員');
    end if;
    if exists (select 1 from public.toolbox_accounts a where toolbox_norm(a.username) = lower(v_id) and a.id <> v_user.id) then
      return json_build_object('ok', false, 'error', '這個身分證字號已經有其他帳號使用，請洽管理員');
    end if;
    v_hash := public.toolbox_hash_password(v_id);
    update public.toolbox_accounts
    set username = v_id, password_hash = v_hash, identity_key = md5(v_id || v_hash)
    where id = v_user.id;
  end if;
  update public.toolbox_accounts set name = v_name where id = v_user.id;
  insert into public.toolbox_login_events(user_id, name, team, ok, detail)
  values (v_user.id, v_name, v_user.team, true, 'identity_update');
  select * into v_user from public.toolbox_accounts where id = v_user.id;
  return json_build_object('ok', true, 'user', public.toolbox_user_payload(v_user));
end;
$$;
grant execute on function public.toolbox_update_identity(text, text, text) to anon, authenticated;

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
  return json_build_object('ok', true, 'message', '註冊成功，請等待管理員核准後再登入', 'status', 'pending');
end;
$$;
