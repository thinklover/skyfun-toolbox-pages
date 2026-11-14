-- 會議計分設定：加減分權限管理員加入黃怡婷（與簡為倢、邱奕棋、蘇崇瑋同權）

create or replace function public.msb_can_manage_editors(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.toolbox_accounts a
    where a.id = p_uid
      and a.status = 'active'
      and trim(coalesce(a.name, '')) in ('簡為倢', '邱奕棋', '蘇崇瑋', '黃怡婷')
  );
$$;

create or replace function public.msb_editors_list(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
begin
  if not public.msb_can_manage_editors(v_uid) then
    return json_build_object('ok', false, 'error', '只有簡為倢、邱奕棋、蘇崇瑋、黃怡婷可以設定加減分權限');
  end if;
  return json_build_object(
    'ok', true,
    'accounts', coalesce((
      select json_agg(row_to_json(x) order by x.on desc, x.team, x.name)
      from (
        select
          a.id,
          trim(coalesce(nullif(a.name, ''), '未命名')) as name,
          trim(coalesce(a.team, '')) as team,
          trim(coalesce(a.job_title, '')) as title,
          (e.account_id is not null) as on
        from public.toolbox_accounts a
        left join public.msb_score_editors e on e.account_id = a.id
        where a.status = 'active'
      ) x
    ), '[]'::json)
  );
end;
$$;

create or replace function public.msb_editors_set(p_token text, p_account_id uuid, p_on boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
begin
  if not public.msb_can_manage_editors(v_uid) then
    return json_build_object('ok', false, 'error', '只有簡為倢、邱奕棋、蘇崇瑋、黃怡婷可以設定加減分權限');
  end if;
  if p_account_id is null or not exists (
    select 1 from public.toolbox_accounts a where a.id = p_account_id and a.status = 'active'
  ) then
    return json_build_object('ok', false, 'error', '找不到這個帳號');
  end if;
  if coalesce(p_on, false) then
    insert into public.msb_score_editors (account_id) values (p_account_id)
    on conflict (account_id) do nothing;
  else
    delete from public.msb_score_editors where account_id = p_account_id;
  end if;
  return json_build_object('ok', true, 'on', coalesce(p_on, false));
end;
$$;

-- 同步勾選黃怡婷的加減分權限（若帳號存在）
insert into public.msb_score_editors (account_id)
select a.id
from public.toolbox_accounts a
where a.status = 'active'
  and trim(coalesce(a.name, '')) = '黃怡婷'
on conflict (account_id) do nothing;

notify pgrst, 'reload schema';
