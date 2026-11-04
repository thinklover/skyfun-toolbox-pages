-- 應繳／清冊繳交日 LINE 提醒
-- 1) 每月 5 號：通知各地區小組長（admin_points_staff.leader）填寫「案件繳交日」
-- 2) 案件繳交日前 5～1 天：營業處繳交率 <100% → 通知該處「營業處經理」（toolbox_accounts.job_title）
-- 3) 清冊繳交日前 5～1 天：通知該區專案含「清冊＋公會對接」的秘書
-- 營業處應繳快照由 Worker 晨間更新（ops_alert_secret 授權）

create table if not exists public.admin_points_lease_office_stats (
  month text not null,
  region text not null default '',
  office text not null,
  due_cnt int not null default 0,
  paid_cnt int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month, region, office)
);
alter table public.admin_points_lease_office_stats enable row level security;
revoke all on public.admin_points_lease_office_stats from public, anon, authenticated;

create table if not exists public.admin_points_lease_due_remind_log (
  id bigserial primary key,
  sent_at timestamptz not null default now(),
  kind text not null default '',
  target text not null default '',
  office text not null default '',
  region text not null default '',
  recipients int not null default 0,
  message text not null default '',
  net_request_id bigint,
  error text not null default ''
);
alter table public.admin_points_lease_due_remind_log enable row level security;
revoke all on public.admin_points_lease_due_remind_log from public, anon, authenticated;

create or replace function public.admin_points_ops_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_secret, '') <> ''
    and (
      public.toolbox_check_admin(p_secret)
      or exists (
        select 1 from public.line_settings s
        where s.key = 'ops_alert_secret' and s.value = p_secret
      )
    );
$$;
revoke all on function public.admin_points_ops_secret_ok(text) from public, anon, authenticated;

/** Worker：覆寫某月各營業處應繳／已繳件數 */
create or replace function public.admin_points_lease_office_stats_upsert(
  p_secret text,
  p_month text,
  p_rows json
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := left(trim(coalesce(p_month, '')), 7);
  v_item json;
  v_n int := 0;
begin
  if not public.admin_points_ops_secret_ok(p_secret) then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if v_month !~ '^\d{4}-\d{2}$' then
    return json_build_object('ok', false, 'error', 'month 格式須 YYYY-MM');
  end if;
  delete from public.admin_points_lease_office_stats where month = v_month;
  if p_rows is null or json_typeof(p_rows) <> 'array' then
    return json_build_object('ok', true, 'month', v_month, 'rows', 0);
  end if;
  for v_item in select * from json_array_elements(p_rows)
  loop
    insert into public.admin_points_lease_office_stats (month, region, office, due_cnt, paid_cnt, updated_at)
    values (
      v_month,
      left(trim(coalesce(v_item->>'region', '')), 10),
      left(trim(coalesce(v_item->>'office', '')), 40),
      greatest(0, coalesce((v_item->>'due')::int, (v_item->>'due_cnt')::int, 0)),
      greatest(0, coalesce((v_item->>'paid')::int, (v_item->>'paid_cnt')::int, 0)),
      now()
    )
    on conflict (month, region, office) do update set
      due_cnt = excluded.due_cnt,
      paid_cnt = excluded.paid_cnt,
      updated_at = now();
    v_n := v_n + 1;
  end loop;
  return json_build_object('ok', true, 'month', v_month, 'rows', v_n);
end;
$$;
revoke all on function public.admin_points_lease_office_stats_upsert(text, text, json) from public;
grant execute on function public.admin_points_lease_office_stats_upsert(text, text, json) to anon, authenticated;

/** 營業處經理對照：職稱＝營業處經理，處別取 team（與公司系統營業處對齊） */
create or replace function public.admin_points_office_managers()
returns table (office text, name text, line_bound boolean, username text)
language sql
stable
security definer
set search_path = public
as $$
  select
    trim(a.team) as office,
    trim(coalesce(nullif(a.name, ''), a.username)) as name,
    exists (
      select 1 from public.line_bindings b
      where b.user_id = a.id and coalesce(b.line_user_id, '') <> ''
    ) as line_bound,
    a.username
  from public.toolbox_accounts a
  where a.status = 'active'
    and trim(coalesce(a.job_title, '')) = '營業處經理'
    and trim(coalesce(a.team, '')) ~ '處$'
  order by 1, 2;
$$;
revoke all on function public.admin_points_office_managers() from public, anon, authenticated;

/** 名單預覽：可通知／缺口（後台密碼） */
create or replace function public.admin_points_lease_due_roster(p_secret text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month text := to_char((now() at time zone 'Asia/Taipei'), 'YYYY-MM');
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  return json_build_object(
    'ok', true,
    'month', v_month,
    'managers', coalesce((
      select json_agg(json_build_object(
        'office', m.office, 'name', m.name, 'lineBound', m.line_bound, 'username', m.username
      ) order by m.office, m.name)
      from public.admin_points_office_managers() m
    ), '[]'::json),
    'leaders', coalesce((
      select json_agg(json_build_object(
        'name', x.name,
        'lineBound', exists (
          select 1 from public.toolbox_accounts a
          join public.line_bindings b on b.user_id = a.id
          where a.status = 'active'
            and trim(coalesce(nullif(a.name, ''), a.username)) = x.name
            and coalesce(b.line_user_id, '') <> ''
        )
      ) order by x.name)
      from (
        select distinct trim(s.leader) as name
        from public.admin_points_staff s
        where s.status = '在職' and coalesce(s.leader, '') <> ''
      ) x
    ), '[]'::json),
    'secretaries', coalesce((
      select json_agg(json_build_object(
        'name', s.name,
        'region', s.region,
        'office', s.office,
        'project', s.project,
        'lineBound', exists (
          select 1 from public.toolbox_accounts a
          join public.line_bindings b on b.user_id = a.id
          where a.status = 'active'
            and trim(coalesce(nullif(a.name, ''), a.username)) = s.name
            and coalesce(b.line_user_id, '') <> ''
        )
      ) order by s.region, s.name)
      from public.admin_points_staff s
      where s.status = '在職' and s.kind <> '工讀生'
        and coalesce(s.project, '') like '%清冊%'
    ), '[]'::json),
    'dues', coalesce((
      select json_agg(json_build_object(
        'region', d.region, 'due', d.due_date, 'caseDue', d.case_due_date
      ) order by d.region)
      from public.admin_points_lease_due d
      where d.month = v_month
    ), '[]'::json),
    'officeStats', coalesce((
      select json_agg(json_build_object(
        'region', o.region, 'office', o.office, 'due', o.due_cnt, 'paid', o.paid_cnt,
        'rate', case when o.due_cnt > 0 then round(100.0 * o.paid_cnt / o.due_cnt, 1) else null end
      ) order by o.region, o.office)
      from public.admin_points_lease_office_stats o
      where o.month = v_month
    ), '[]'::json),
    'gaps', json_build_object(
      'managersNoLine', coalesce((
        select json_agg(json_build_object('office', m.office, 'name', m.name) order by m.office)
        from public.admin_points_office_managers() m where not m.line_bound
      ), '[]'::json),
      'statsOfficesNoManager', coalesce((
        select json_agg(distinct o.office order by o.office)
        from public.admin_points_lease_office_stats o
        where o.month = v_month and o.due_cnt > 0
          and o.office ~ '處$'
          and not exists (
            select 1 from public.admin_points_office_managers() m where m.office = o.office
          )
      ), '[]'::json),
      'rentalDepts', coalesce((
        select json_agg(distinct o.office order by o.office)
        from public.admin_points_lease_office_stats o
        where o.month = v_month and o.due_cnt > 0 and o.office like '%租管部'
      ), '[]'::json)
    )
  );
end;
$$;
grant execute on function public.admin_points_lease_due_roster(text) to anon, authenticated;

create or replace function public.admin_points_lease_due_remind(p_dry boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_month text := to_char(v_today, 'YYYY-MM');
  v_url text := 'https://toolbox.skyfunsystem.com/?page=admin-points';
  v_out jsonb := '[]'::jsonb;
  v_msg text;
  v_push json;
  v_days int;
  r record;
  m record;
  s record;
  v_due int;
  v_paid int;
  v_rate numeric;
  v_roster_done int;
  v_roster_total int := 30; -- 4／4-1／5 期 × 10 項
begin
  -- A. 每月 5 號：小組長填案件繳交日
  if extract(day from v_today)::int = 5 then
    for r in
      select distinct trim(st.leader) as name
      from public.admin_points_staff st
      where st.status = '在職' and coalesce(st.leader, '') <> ''
      order by 1
    loop
      v_msg := format(
        E'📅 案件繳交日填寫提醒\n%s 您好：\n今天是 %s 月 5 日，請到工具箱「行政績效中心」為各地區填寫本月「案件繳交日」。\n尚未填寫的地區請盡快補上，系統會在繳交日前 5～1 天依繳交率通知營業處經理。\n%s',
        r.name, to_char(v_today, 'FMMM'), v_url
      );
      if p_dry then
        v_out := v_out || jsonb_build_object('kind', 'leader_case_due', 'target', r.name, 'message', v_msg);
      else
        v_push := public.admin_points_line_push(r.name, v_msg);
        insert into public.admin_points_lease_due_remind_log (kind, target, message, recipients, net_request_id, error)
        values (
          'leader_case_due', r.name, v_msg,
          coalesce((v_push->>'recipients')::int, 0),
          nullif(v_push->>'req', '')::bigint,
          coalesce(v_push->>'error', '')
        );
        v_out := v_out || jsonb_build_object('kind', 'leader_case_due', 'target', r.name, 'recipients', coalesce((v_push->>'recipients')::int, 0), 'error', coalesce(v_push->>'error', ''));
      end if;
    end loop;
  end if;

  -- B. 案件繳交日前 5～1 天：營業處經理（繳交率 <100%）
  for r in
    select d.region, d.case_due_date
    from public.admin_points_lease_due d
    where d.month = v_month
      and d.case_due_date is not null
      and d.case_due_date - v_today between 1 and 5
    order by d.region
  loop
    v_days := r.case_due_date - v_today;
    for m in
      select o.office, sum(o.due_cnt)::int as due_cnt, sum(o.paid_cnt)::int as paid_cnt
      from public.admin_points_lease_office_stats o
      where o.month = v_month and o.region = r.region and o.due_cnt > 0 and o.office ~ '處$'
      group by o.office
      having sum(o.paid_cnt) < sum(o.due_cnt)
      order by o.office
    loop
      v_due := m.due_cnt;
      v_paid := m.paid_cnt;
      v_rate := case when v_due > 0 then round(100.0 * v_paid / v_due, 1) else 0 end;
      for s in
        select * from public.admin_points_office_managers() x where x.office = m.office
      loop
        v_msg := format(
          E'⚠️ 案件繳交提醒（%s）\n%s 您好：\n【%s】%s 案件繳交日為 %s（還有 %s 天），目前繳交率 %s%%（已繳 %s／應繳 %s），尚未達 100%%。\n請督催同仁至工具箱「行政績效中心」完成打勾。\n%s',
          m.office, s.name, r.region, m.office,
          to_char(r.case_due_date, 'FMMM/FMDD'), v_days, v_rate, v_paid, v_due, v_url
        );
        if p_dry then
          v_out := v_out || jsonb_build_object('kind', 'manager_case_due', 'target', s.name, 'office', m.office, 'region', r.region, 'rate', v_rate, 'message', v_msg);
        else
          v_push := public.admin_points_line_push(s.name, v_msg);
          insert into public.admin_points_lease_due_remind_log (kind, target, office, region, message, recipients, net_request_id, error)
          values (
            'manager_case_due', s.name, m.office, r.region, v_msg,
            coalesce((v_push->>'recipients')::int, 0),
            nullif(v_push->>'req', '')::bigint,
            coalesce(v_push->>'error', '')
          );
          v_out := v_out || jsonb_build_object('kind', 'manager_case_due', 'target', s.name, 'office', m.office, 'recipients', coalesce((v_push->>'recipients')::int, 0), 'error', coalesce(v_push->>'error', ''));
        end if;
      end loop;
      -- 有應繳但找不到營業處經理：記 log（dry 也回傳）
      if not exists (select 1 from public.admin_points_office_managers() x where x.office = m.office) then
        v_out := v_out || jsonb_build_object(
          'kind', 'manager_missing', 'office', m.office, 'region', r.region,
          'due', v_due, 'paid', v_paid, 'error', '找不到營業處經理（職稱／處別）'
        );
        if not p_dry then
          insert into public.admin_points_lease_due_remind_log (kind, target, office, region, message, recipients, error)
          values ('manager_missing', '', m.office, r.region,
            format('%s %s 應繳 %s 已繳 %s', r.region, m.office, v_due, v_paid),
            0, '找不到營業處經理');
        end if;
      end if;
    end loop;
  end loop;

  -- C. 清冊繳交日前 5～1 天：清冊專案秘書
  for r in
    select d.region, d.due_date
    from public.admin_points_lease_due d
    where d.month = v_month
      and d.due_date is not null
      and d.due_date - v_today between 1 and 5
    order by d.region
  loop
    v_days := r.due_date - v_today;
    select count(*)::int into v_roster_done
    from public.admin_points_roster_progress p
    where p.month = v_month and p.region = r.region;
    for s in
      select st.name, st.office, st.project
      from public.admin_points_staff st
      where st.status = '在職' and st.kind <> '工讀生'
        and coalesce(st.project, '') like '%清冊%'
        and trim(coalesce(st.region, '')) = r.region
      order by st.name
    loop
      v_msg := format(
        E'📋 清冊繳交提醒（%s）\n%s 您好：\n【%s】清冊繳交日為 %s（還有 %s 天）。清冊進度目前 %s／%s。\n請至工具箱「行政績效中心 → 清冊進度」確認並打勾。\n%s',
        r.region, s.name, r.region,
        to_char(r.due_date, 'FMMM/FMDD'), v_days,
        least(v_roster_done, v_roster_total), v_roster_total, v_url
      );
      if p_dry then
        v_out := v_out || jsonb_build_object('kind', 'secretary_roster_due', 'target', s.name, 'region', r.region, 'message', v_msg);
      else
        v_push := public.admin_points_line_push(s.name, v_msg);
        insert into public.admin_points_lease_due_remind_log (kind, target, region, message, recipients, net_request_id, error)
        values (
          'secretary_roster_due', s.name, r.region, v_msg,
          coalesce((v_push->>'recipients')::int, 0),
          nullif(v_push->>'req', '')::bigint,
          coalesce(v_push->>'error', '')
        );
        v_out := v_out || jsonb_build_object('kind', 'secretary_roster_due', 'target', s.name, 'region', r.region, 'recipients', coalesce((v_push->>'recipients')::int, 0), 'error', coalesce(v_push->>'error', ''));
      end if;
    end loop;
    if not exists (
      select 1 from public.admin_points_staff st
      where st.status = '在職' and st.kind <> '工讀生'
        and coalesce(st.project, '') like '%清冊%'
        and trim(coalesce(st.region, '')) = r.region
    ) then
      v_out := v_out || jsonb_build_object('kind', 'secretary_missing', 'region', r.region, 'error', '該區沒有清冊＋公會對接專案人員');
      if not p_dry then
        insert into public.admin_points_lease_due_remind_log (kind, region, message, recipients, error)
        values ('secretary_missing', r.region, format('%s 清冊繳交日 %s', r.region, r.due_date), 0, '該區沒有清冊專案秘書');
      end if;
    end if;
  end loop;

  if not p_dry then
    delete from public.admin_points_lease_due_remind_log where sent_at < now() - interval '90 days';
  end if;
  return json_build_object('ok', true, 'dry', p_dry, 'today', v_today, 'month', v_month, 'list', v_out);
end;
$$;
revoke all on function public.admin_points_lease_due_remind(boolean) from public, anon, authenticated;

/** Worker：讀取期間內已打勾的合約 id（ops_alert_secret／後台密碼） */
create or replace function public.admin_points_lease_checked_ids(p_secret text, p_start date, p_end date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_points_ops_secret_ok(p_secret) then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;
  return json_build_object('ok', true, 'ids', coalesce((
    select json_agg(s.contract_id)
    from public.admin_points_lease_submit s
    where s.lease_start between p_start and p_end
  ), '[]'::json));
end;
$$;
revoke all on function public.admin_points_lease_checked_ids(text, date, date) from public;
grant execute on function public.admin_points_lease_checked_ids(text, date, date) to anon, authenticated;

-- 每天 09:40 台北 = 01:40 UTC（接在抽查提醒之後；晨間 Worker 08:00 已更新應繳快照）
select cron.unschedule(jobid) from cron.job where jobname = 'admin-points-lease-due-remind';
select cron.schedule(
  'admin-points-lease-due-remind',
  '40 1 * * *',
  $$select public.admin_points_lease_due_remind(false)$$
);
