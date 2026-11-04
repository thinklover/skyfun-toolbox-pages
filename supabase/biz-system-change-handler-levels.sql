-- 系統欄位更改通報：處理層級（業務→處長→行政→管理員黃怡婷）
-- 已於遠端套用；本檔供本地對齊用。

alter table public.biz_system_change
  add column if not exists handler_level text not null default 'manager';

update public.biz_system_change
   set handler_level = 'manager'
 where coalesce(nullif(trim(handler_level), ''), '') = ''
    or handler_level not in ('manager', 'admin', 'super');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'biz_system_change_handler_level_chk'
  ) then
    alter table public.biz_system_change
      add constraint biz_system_change_handler_level_chk
      check (handler_level in ('manager', 'admin', 'super'));
  end if;
end $$;

create or replace function public.biz_system_change_row_json(a public.biz_system_change)
returns json
language sql
stable
as $$
  select json_build_object(
    'id', a.id,
    'createdAt', a.created_at,
    'authorName', a.author_name,
    'team', a.team,
    'userId', a.user_id,
    'modifierName', a.modifier_name,
    'modifierTeam', a.modifier_team,
    'handlerLevel', a.handler_level,
    'address', a.address,
    'matchNo', a.match_no,
    'nodes', a.nodes,
    'content', a.content,
    'attachments', a.attachments,
    'status', a.status,
    'adminNote', a.admin_note,
    'handledAt', a.handled_at,
    'handledBy', a.handled_by
  );
$$;

create or replace function public.biz_system_change_role(p_uid uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
  v_team text;
  v_title text;
  v_role text := 'sales';
begin
  select
    trim(coalesce(nullif(a.name, ''), a.username)),
    trim(coalesce(a.team, '')),
    trim(coalesce(a.job_title, ''))
    into v_name, v_team, v_title
  from public.toolbox_accounts a where a.id = p_uid;
  if coalesce(v_name, '') = '' then
    return json_build_object('name', '', 'team', '', 'title', '', 'role', 'guest');
  end if;
  if v_name = '黃怡婷' then
    v_role := 'super';
  elsif v_team = '行政管理部' then
    v_role := 'admin';
  elsif v_title = '營業處經理' then
    v_role := 'manager';
  elsif v_team like '%處' then
    v_role := 'sales';
  else
    v_role := 'other';
  end if;
  return json_build_object('name', v_name, 'team', v_team, 'title', v_title, 'role', v_role);
end;
$$;

-- submit／for_me／mark_done／transfer 以遠端目前定義為準（見 migration 紀錄）。
-- 請勿再使用 biz_system_change_ask_admin。
drop function if exists public.biz_system_change_ask_admin(text, bigint);

grant execute on function public.biz_system_change_role(uuid) to anon, authenticated;
grant execute on function public.biz_system_change_transfer(text, bigint, text) to anon, authenticated;
