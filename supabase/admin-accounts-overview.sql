-- 帳號一覽（唯讀）：toolbox_check_admin（總管或核准專用密碼）
-- 僅回傳已核准帳號的處別／姓名／帳號／最近登入；無寫入能力

create or replace function public.toolbox_admin_accounts_overview(p_secret text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;

  return json_build_object(
    'ok', true,
    'teams', coalesce((
      select json_agg(row_to_json(t) order by t.team)
      from (
        select
          coalesce(nullif(trim(a.team), ''), '（未填處別）') as team,
          count(*)::int as count
        from public.toolbox_accounts a
        where a.status = 'active'
        group by 1
      ) t
    ), '[]'::json),
    'users', coalesce((
      select json_agg(row_to_json(x))
      from (
        select
          a.id,
          a.username,
          a.name,
          coalesce(nullif(trim(a.team), ''), '（未填處別）') as team,
          a.last_active as "lastActive",
          (
            select e.created_at from public.toolbox_login_events e
            where e.user_id = a.id
              and e.detail in ('login_ok', 'bad_password', 'disabled', 'rejected', 'pending')
            order by e.created_at desc limit 1
          ) as "lastLoginAt",
          (
            select e.detail from public.toolbox_login_events e
            where e.user_id = a.id
              and e.detail in ('login_ok', 'bad_password', 'disabled', 'rejected', 'pending')
            order by e.created_at desc limit 1
          ) as "lastLoginDetail",
          (
            select e.ok from public.toolbox_login_events e
            where e.user_id = a.id
              and e.detail in ('login_ok', 'bad_password', 'disabled', 'rejected', 'pending')
            order by e.created_at desc limit 1
          ) as "lastLoginOk"
        from public.toolbox_accounts a
        where a.status = 'active'
        order by
          coalesce(nullif(trim(a.team), ''), '（未填處別）'),
          a.name nulls last,
          a.username
        limit 2000
      ) x
    ), '[]'::json)
  );
end;
$function$;

grant execute on function public.toolbox_admin_accounts_overview(text) to anon, authenticated;
