-- 簽呈公告「已閱畢知悉」打勾紀錄（業務同仁＝處別以「處」結尾）
-- 依賴：toolbox_accounts、admin_qa_user_id(p_token)、toolbox_check_admin(p_secret)
-- 公告內容放前端 js/notice-ack-data.js，這裡只記誰在何時勾了哪一則

create table if not exists public.toolbox_notice_ack (
  notice_id text not null,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  user_name text not null default '',
  team text not null default '',
  acked_at timestamptz not null default now(),
  primary key (notice_id, user_id)
);

alter table public.toolbox_notice_ack enable row level security;

create or replace function public.toolbox_notice_ack_mine(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_team text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select trim(coalesce(a.team, '')) into v_team from public.toolbox_accounts a where a.id = v_uid;
  return json_build_object(
    'ok', true,
    'team', coalesce(v_team, ''),
    'isSales', coalesce(v_team, '') like '%處',
    'acks', coalesce((
      select json_agg(json_build_object('id', k.notice_id, 'at', k.acked_at) order by k.acked_at)
      from public.toolbox_notice_ack k
      where k.user_id = v_uid
    ), '[]'::json)
  );
end;
$$;

create or replace function public.toolbox_notice_ack_set(p_token text, p_notice_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_id text := trim(coalesce(p_notice_id, ''));
  v_name text;
  v_team text;
  v_at timestamptz;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  if v_id !~ '^[a-z0-9-]{3,60}$' then
    return json_build_object('ok', false, 'error', '公告代碼錯誤');
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username)), trim(coalesce(a.team, ''))
    into v_name, v_team
  from public.toolbox_accounts a where a.id = v_uid;
  insert into public.toolbox_notice_ack (notice_id, user_id, user_name, team)
  values (v_id, v_uid, coalesce(v_name, ''), coalesce(v_team, ''))
  on conflict (notice_id, user_id) do nothing;
  select acked_at into v_at from public.toolbox_notice_ack where notice_id = v_id and user_id = v_uid;
  return json_build_object('ok', true, 'id', v_id, 'at', v_at);
end;
$$;

create or replace function public.toolbox_notice_ack_admin(p_secret text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  return json_build_object(
    'ok', true,
    'users', coalesce((
      select json_agg(json_build_object('id', a.id, 'name', trim(coalesce(nullif(a.name, ''), a.username)), 'team', trim(a.team))
        order by a.team, a.name)
      from public.toolbox_accounts a
      where a.status = 'active' and trim(coalesce(a.team, '')) like '%處'
    ), '[]'::json),
    'acks', coalesce((
      select json_agg(json_build_object('id', k.notice_id, 'userId', k.user_id, 'name', k.user_name, 'team', k.team, 'at', k.acked_at)
        order by k.acked_at)
      from public.toolbox_notice_ack k
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.toolbox_notice_ack_mine(text) to anon, authenticated;
grant execute on function public.toolbox_notice_ack_set(text, text) to anon, authenticated;
grant execute on function public.toolbox_notice_ack_admin(text) to anon, authenticated;
