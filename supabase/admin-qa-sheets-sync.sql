-- 行政 QA 點數 → Google 試算表同步（配合 docs/google-sheets/admin-qa-sync/Code.gs）
-- 在 Supabase SQL Editor 執行

create or replace function public.admin_qa_sheets_sync_pull(p_secret text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows json;
  v_event_ids bigint[];
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;

  select coalesce(array_agg(distinct p.id), '{}'::bigint[])
  into v_event_ids
  from public.admin_qa_point_events p
  where p.status = 'approved'
    and p.sheets_exported_at is null;

  if coalesce(array_length(v_event_ids, 1), 0) = 0 then
    return json_build_object('ok', true, 'rows', '[]'::json, 'eventIds', '[]'::json);
  end if;

  select coalesce(json_agg(row_to_json(x) order by x."workDate", x."matchName"), '[]'::json)
  into v_rows
  from (
    select
      to_char(d.work_date, 'YYYY-MM-DD') as "workDate",
      coalesce(nullif(trim(max(a.name)), ''), nullif(trim(e.user_name), ''), '') as "matchName",
      coalesce(nullif(trim(max(a.name)), ''), nullif(trim(e.user_name), ''), '') as "displayName",
      coalesce(max(a.username), '') as "username",
      e.user_id as "userId",
      sum(e.points)::int as "totalPoints",
      coalesce(array_agg(e.id) filter (where e.sheets_exported_at is null), '{}'::bigint[]) as "eventIds"
    from (
      select distinct
        pe.user_id,
        (pe.reviewed_at at time zone 'Asia/Taipei')::date as work_date
      from public.admin_qa_point_events pe
      where pe.status = 'approved'
        and pe.reviewed_at is not null
        and pe.sheets_exported_at is null
    ) d
    join public.admin_qa_point_events e
      on e.user_id = d.user_id
     and e.status = 'approved'
     and e.reviewed_at is not null
     and (e.reviewed_at at time zone 'Asia/Taipei')::date = d.work_date
    left join public.toolbox_accounts a on a.id = e.user_id
    group by d.work_date, e.user_id, e.user_name
  ) x
  where x."matchName" <> '';

  return json_build_object(
    'ok', true,
    'rows', coalesce(v_rows, '[]'::json),
    'eventIds', to_json(v_event_ids)
  );
end;
$$;

create or replace function public.admin_qa_sheets_sync_ack(
  p_secret text,
  p_event_ids bigint[] default '{}'::bigint[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if coalesce(array_length(p_event_ids, 1), 0) = 0 then
    return json_build_object('ok', true, 'marked', 0);
  end if;
  update public.admin_qa_point_events
  set sheets_exported_at = now()
  where id = any (p_event_ids)
    and status = 'approved'
    and sheets_exported_at is null;
  get diagnostics v_count = row_count;
  return json_build_object('ok', true, 'marked', v_count);
end;
$$;

-- 優質標記改點數時，重新排入試算表同步
create or replace function public.admin_qa_sync_quality_points(
  p_kind text,
  p_id uuid,
  p_enabled boolean
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.admin_qa_point_events%rowtype;
  v_new_pts int;
begin
  if p_kind = 'question' then
    select * into v_event
    from public.admin_qa_point_events
    where question_id = p_id and event_type = 'ask' and status = 'approved'
    order by reviewed_at desc nulls last
    limit 1;
  elsif p_kind = 'answer' then
    select * into v_event
    from public.admin_qa_point_events
    where answer_id = p_id and event_type = 'answer' and status = 'approved'
    order by reviewed_at desc nulls last
    limit 1;
  else
    return 0;
  end if;

  if not found then
    return 0;
  end if;

  v_new_pts := admin_qa_award_points(v_event.user_id, v_event.event_type, coalesce(p_enabled, false));
  if v_event.points is distinct from v_new_pts then
    update public.admin_qa_point_events
    set points = v_new_pts,
        sheets_exported_at = null
    where id = v_event.id;
  end if;
  return v_new_pts;
end;
$$;

grant execute on function public.admin_qa_sheets_sync_pull(text) to anon, authenticated;
grant execute on function public.admin_qa_sheets_sync_ack(text, bigint[]) to anon, authenticated;
