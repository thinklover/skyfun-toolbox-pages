-- 帳號核准專用密碼（accounts_admin_secret）
-- - 核准後台 RPC（toolbox_admin_*）：只認 accounts_admin_secret
-- - 其他後台（toolbox_check_admin）：admin_secret 或 accounts_admin_secret 皆可
-- 勿把真實密碼 commit 進此檔。

create or replace function public.toolbox_check_accounts_admin(p_secret text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v text;
  s text := coalesce(p_secret, '');
begin
  if s = '' then
    return false;
  end if;
  select value into v from public.toolbox_settings where key = 'accounts_admin_secret';
  return coalesce(v, '') <> '' and v = s;
end;
$function$;

create or replace function public.toolbox_check_admin(p_secret text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin text;
  v_accounts text;
  s text := coalesce(p_secret, '');
begin
  if s = '' then
    return false;
  end if;
  select value into v_admin from public.toolbox_settings where key = 'admin_secret';
  select value into v_accounts from public.toolbox_settings where key = 'accounts_admin_secret';
  if coalesce(v_admin, '') <> '' and v_admin = s then
    return true;
  end if;
  if coalesce(v_accounts, '') <> '' and v_accounts = s then
    return true;
  end if;
  return false;
end;
$function$;
