-- 會議計分中心：補部別／對帳號（需已先執行 meeting-scoreboard-staff-month.sql）
-- 只加／覆寫函式與 grant，不刪舊表或舊資料。

create or replace function public.msb_accounts_lookup(p_token text, p_q text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  v_can_edit boolean;
  v_q text := left(trim(coalesce(p_q, '')), 40);
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;
  return json_build_object(
    'ok', true,
    'accounts', coalesce((
      select json_agg(json_build_object(
          'id', a.id,
          'name', trim(coalesce(nullif(a.name, ''), a.username, '')),
          'username', coalesce(a.username, ''),
          'team', trim(coalesce(a.team, '')),
          'title', trim(coalesce(a.job_title, ''))
        ) order by trim(coalesce(nullif(a.name, ''), a.username, '')), a.username)
      from (
        select *
        from public.toolbox_accounts a
        where a.status = 'active'
          and (
            v_q = ''
            or trim(coalesce(nullif(a.name, ''), a.username, '')) ilike '%' || v_q || '%'
            or coalesce(a.username, '') ilike '%' || v_q || '%'
            or trim(coalesce(a.team, '')) ilike '%' || v_q || '%'
          )
        order by trim(coalesce(nullif(a.name, ''), a.username, '')), a.username
        limit 120
      ) a
    ), '[]'::json)
  );
end;
$$;

drop function if exists public.msb_person_patch(text, bigint, text, uuid);

create or replace function public.msb_person_patch(
  p_token text,
  p_id bigint,
  p_department text default null,
  p_account_id uuid default null,
  p_job_title text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  v_can_edit boolean;
  v_dept text;
  v_title text;
  v_account uuid := p_account_id;
  v_team text := '';
  v_row public.msb_people%rowtype;
begin
  select o_can_edit into v_can_edit from public.msb_actor(v_uid);
  if not coalesce(v_can_edit, false) then
    return json_build_object('ok', false, 'error', '沒有權限修改');
  end if;

  select * into v_row from public.msb_people where id = p_id and active = true;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這位人員');
  end if;

  if p_department is null then
    v_dept := coalesce(v_row.department, '');
  else
    v_dept := left(trim(coalesce(p_department, '')), 40);
  end if;

  if p_job_title is null then
    v_title := coalesce(v_row.job_title, '');
  else
    v_title := left(trim(coalesce(p_job_title, '')), 40);
  end if;

  if v_account is not null then
    select trim(coalesce(a.team, '')) into v_team
    from public.toolbox_accounts a
    where a.id = v_account and a.status = 'active';
    if not found then
      return json_build_object('ok', false, 'error', '找不到可綁定的在職帳號');
    end if;
    if v_dept = '' and coalesce(v_team, '') <> '' then
      v_dept := left(v_team, 40);
    end if;
  else
    v_account := v_row.account_id;
  end if;

  update public.msb_people
     set department = coalesce(v_dept, ''),
         job_title = coalesce(v_title, ''),
         account_id = v_account
   where id = p_id
  returning * into v_row;

  update public.msb_people
     set department = coalesce(v_dept, ''),
         job_title = coalesce(v_title, '')
   where active = true
     and name = v_row.name
     and id <> p_id;

  return json_build_object(
    'ok', true,
    'id', v_row.id,
    'name', v_row.name,
    'department', coalesce(v_row.department, ''),
    'title', coalesce(v_row.job_title, ''),
    'accountId', v_row.account_id
  );
end;
$$;

revoke all on function public.msb_accounts_lookup(text, text) from public;
revoke all on function public.msb_person_patch(text, bigint, text, uuid, text) from public;
grant execute on function public.msb_accounts_lookup(text, text) to anon, authenticated;
grant execute on function public.msb_person_patch(text, bigint, text, uuid, text) to anon, authenticated;
