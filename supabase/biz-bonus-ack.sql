-- 業務獎金辦法「已閱畢知悉」（與簽呈公告 toolbox_notice_ack 分開）
-- 依賴：toolbox_accounts、admin_qa_user_id(p_token)
-- 辦法清單在前端 js/biz-bonus-data.js；此處只記誰何時勾了哪一份
-- 儀表板：登入工具箱即可查看（完成率圓圈＋分處名單）

create table if not exists public.toolbox_biz_bonus_ack (
  doc_id text not null,
  user_id uuid not null references public.toolbox_accounts(id) on delete cascade,
  user_name text not null default '',
  team text not null default '',
  acked_at timestamptz not null default now(),
  primary key (doc_id, user_id)
);

alter table public.toolbox_biz_bonus_ack enable row level security;

create or replace function public.toolbox_biz_bonus_mgr_ok(p_password text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  -- sha256('skyfun-manager-bonus:' || password) 與前端 policy-doc-gate HASH 相同
  v_hash text := 'a012f2d92edb3fb1d06c889c194a331ce314ac0a4b283e6eaac917c7f2ef2e12';
  v_got text;
begin
  if trim(coalesce(p_password, '')) = '' then
    return false;
  end if;
  v_got := encode(digest(convert_to('skyfun-manager-bonus:' || trim(p_password), 'UTF8'), 'sha256'), 'hex');
  return v_got = v_hash;
end;
$$;

create or replace function public.toolbox_biz_bonus_ack_mine(p_token text)
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
      select json_agg(json_build_object('id', k.doc_id, 'at', k.acked_at) order by k.acked_at)
      from public.toolbox_biz_bonus_ack k
      where k.user_id = v_uid
    ), '[]'::json)
  );
end;
$$;

create or replace function public.toolbox_biz_bonus_ack_set(p_token text, p_doc_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_id text := trim(coalesce(p_doc_id, ''));
  v_name text;
  v_team text;
  v_at timestamptz;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  if v_id !~ '^[a-z0-9-]{3,60}$' then
    return json_build_object('ok', false, 'error', '辦法代碼錯誤');
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username)), trim(coalesce(a.team, ''))
    into v_name, v_team
  from public.toolbox_accounts a where a.id = v_uid;
  if coalesce(v_team, '') not like '%處' then
    return json_build_object('ok', false, 'error', '僅營業處業務需打勾知悉');
  end if;
  insert into public.toolbox_biz_bonus_ack (doc_id, user_id, user_name, team)
  values (v_id, v_uid, coalesce(v_name, ''), coalesce(v_team, ''))
  on conflict (doc_id, user_id) do nothing;
  select acked_at into v_at from public.toolbox_biz_bonus_ack where doc_id = v_id and user_id = v_uid;
  return json_build_object('ok', true, 'id', v_id, 'at', v_at);
end;
$$;

create or replace function public.toolbox_biz_bonus_ack_dash(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  return json_build_object(
    'ok', true,
    'users', coalesce((
      select json_agg(json_build_object(
          'id', a.id,
          'name', trim(coalesce(nullif(a.name, ''), a.username)),
          'team', trim(a.team)
        ) order by a.team, a.name)
      from public.toolbox_accounts a
      where a.status = 'active' and trim(coalesce(a.team, '')) like '%處'
    ), '[]'::json),
    'acks', coalesce((
      select json_agg(json_build_object(
          'id', k.doc_id,
          'userId', k.user_id,
          'name', k.user_name,
          'team', k.team,
          'at', k.acked_at
        ) order by k.acked_at)
      from public.toolbox_biz_bonus_ack k
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.toolbox_biz_bonus_mgr_ok(text) to anon, authenticated;
grant execute on function public.toolbox_biz_bonus_ack_mine(text) to anon, authenticated;
grant execute on function public.toolbox_biz_bonus_ack_set(text, text) to anon, authenticated;
grant execute on function public.toolbox_biz_bonus_ack_dash(text) to anon, authenticated;
