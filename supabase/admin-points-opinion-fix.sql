-- 案件／清冊意見「已修正」：填寫的行政修正完成後自己打勾。
-- 填寫超過一天還沒打勾，用 LINE 提醒填寫的人（每天最多一次、只在 09～20 點發）；只提醒 2026/10/15 起填的意見。
-- 下方 admin_points_opinion_fix／_open／_fix_remind 已由 admin-points-opinion-fix-roster.sql 改成案件、清冊都適用。

alter table public.admin_points_opinion add column if not exists fixed_at timestamptz;
alter table public.admin_points_opinion add column if not exists fixed_by text not null default '';
alter table public.admin_points_opinion add column if not exists remind_at timestamptz;
alter table public.admin_points_opinion add column if not exists remind_count int not null default 0;
alter table public.admin_points_opinion add column if not exists remind_error text not null default '';
create index if not exists admin_points_opinion_open_idx on public.admin_points_opinion (staff_name) where kind = 'case' and fixed_at is null;

create or replace function public.admin_points_opinion_remind_from()
returns timestamptz
language sql
immutable
as $$ select timestamptz '2026-10-15 00:00:00+08' $$;

create or replace function public.admin_points_opinion_json(o public.admin_points_opinion)
returns json
language sql
stable
as $$
  select json_build_object(
    'id', o.id, 'kind', o.kind, 'date', o.work_date, 'name', o.staff_name,
    'guildPeriod', o.guild_period, 'caseNo', o.case_no, 'rosterPeriod', o.roster_period, 'region', o.region,
    'opinionDate', o.opinion_date, 'content', o.content, 'measure', o.measure, 'createdAt', o.created_at,
    'category', o.category, 'rosterItem', o.roster_item,
    'noPoints', o.no_points, 'noPointsReason', o.no_points_reason,
    'fixedAt', o.fixed_at, 'fixedBy', o.fixed_by, 'remindAt', o.remind_at, 'remindCount', o.remind_count
  )
$$;
revoke all on function public.admin_points_opinion_json(public.admin_points_opinion) from public, anon, authenticated;

create or replace function public.admin_points_payload(p_start date, p_end date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'ok', true,
    'staff', coalesce((
      select json_agg(json_build_object(
        'id', s.id, 'name', s.name, 'status', s.status, 'kind', s.kind, 'note', s.note,
        'region', s.region, 'office', s.office, 'hireDate', s.hire_date, 'project', s.project,
        'leader', s.leader
      ) order by s.status, s.kind, s.name)
      from public.admin_points_staff s
    ), '[]'::json),
    'incidents', coalesce((
      select json_agg(json_build_object(
        'id', i.id, 'date', i.work_date, 'name', i.staff_name, 'complaints', i.complaints,
        'penalty', i.penalty, 'compensation', i.compensation, 'note', i.note, 'createdBy', i.created_by
      ) order by i.work_date, i.id)
      from public.admin_points_incident i
      where i.work_date between p_start and p_end
    ), '[]'::json),
    'checks', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'date', c.work_date, 'name', c.staff_name, 'checked', c.checked,
        'correct', c.correct, 'note', c.note, 'createdBy', c.created_by,
        'spotKey', c.spot_key, 'spotNode', c.spot_node, 'checkedAt', c.created_at,
        'auditTime', (
          select it->>'time'
          from public.admin_points_spot_draw d, jsonb_array_elements(d.items) it
          where c.spot_key <> '' and it->>'key' = c.spot_key and coalesce(it->>'node', '') = coalesce(c.spot_node, '')
          order by d.created_at desc
          limit 1
        )
      ) order by c.work_date, c.id)
      from public.admin_points_check c
      where c.work_date between p_start and p_end
    ), '[]'::json),
    'manual', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'date', m.work_date, 'name', m.staff_name, 'item', m.item,
        'qty', m.qty, 'points', m.points, 'note', m.note, 'leader', m.leader, 'createdBy', m.created_by
      ) order by m.work_date, m.id)
      from public.admin_points_manual m
      where m.work_date between p_start and p_end
    ), '[]'::json),
    'opinions', coalesce((
      select json_agg(public.admin_points_opinion_json(o) order by o.work_date, o.id)
      from public.admin_points_opinion o
      where o.work_date between p_start and p_end
    ), '[]'::json),
    'training', coalesce((
      select json_agg(json_build_object(
        'id', t.id, 'name', t.staff_name, 'skill', t.skill, 'date', t.trained_date,
        'note', t.note, 'createdBy', t.created_by
      ) order by t.staff_name, t.skill)
      from public.admin_points_training t
    ), '[]'::json)
  );
$$;
revoke all on function public.admin_points_payload(date, date) from public, anon, authenticated;

/** 填寫的行政打勾／取消「已修正」 */
create or replace function public.admin_points_opinion_fix(p_token text, p_id bigint, p_fixed boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_name text;
  v_row public.admin_points_opinion;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_name from public.toolbox_accounts a where a.id = v_uid;
  update public.admin_points_opinion
    set fixed_at = case when coalesce(p_fixed, false) then now() end,
        fixed_by = case when coalesce(p_fixed, false) then v_name else '' end
    where id = p_id and kind = 'case' and (user_id = v_uid or staff_name = v_name)
    returning * into v_row;
  if v_row.id is null then return json_build_object('ok', false, 'error', '只能勾選自己填的案件意見'); end if;
  return json_build_object('ok', true, 'opinion', public.admin_points_opinion_json(v_row));
end;
$$;
revoke all on function public.admin_points_opinion_fix(text, bigint, boolean) from public;
grant execute on function public.admin_points_opinion_fix(text, bigint, boolean) to anon, authenticated;

/** 自己還沒打勾「已修正」的案件意見（不限業績月，上一個月填的也列出來） */
create or replace function public.admin_points_opinion_open(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_name text;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_name from public.toolbox_accounts a where a.id = v_uid;
  return json_build_object('ok', true, 'opinions', coalesce((
    select json_agg(public.admin_points_opinion_json(o) order by o.created_at)
    from public.admin_points_opinion o
    where o.kind = 'case' and o.fixed_at is null and (o.user_id = v_uid or o.staff_name = v_name)
      and o.created_at >= public.admin_points_opinion_remind_from()
  ), '[]'::json));
end;
$$;
revoke all on function public.admin_points_opinion_open(text) from public;
grant execute on function public.admin_points_opinion_open(text) to anon, authenticated;

/** 每小時跑：填寫滿一天還沒打勾的案件意見，同一人合併成一則 LINE；同一筆每天最多提醒一次 */
create or replace function public.admin_points_opinion_fix_remind(p_dry boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_msg text;
  v_push json;
  v_out jsonb := '[]'::jsonb;
  v_url text := 'https://toolbox.skyfunsystem.com/';
begin
  for r in
    select o.staff_name,
           array_agg(o.id order by o.created_at) ids,
           string_agg(format('・%s（%s 填寫%s）', o.case_no, to_char(o.created_at at time zone 'Asia/Taipei', 'FMMM/FMDD'),
             coalesce('，' || nullif(o.category, ''), '')), E'\n' order by o.created_at) lines,
           count(*) n
    from public.admin_points_opinion o
    where o.kind = 'case' and o.fixed_at is null
      and o.created_at >= public.admin_points_opinion_remind_from()
      and o.created_at <= now() - interval '1 day'
      and (o.remind_at is null or o.remind_at <= now() - interval '23 hours')
    group by o.staff_name
  loop
    v_msg := format(E'⏰ 案件意見還沒修正\n%s 您好：\n您填寫的公會案件意見已超過一天，還沒打勾「已修正」（%s 筆）：\n%s\n\n請盡快修正，完成後到工具箱「行政績效中心 → 📝 填寫案件意見」，在清單後面勾「已修正」。\n%s',
      r.staff_name, r.n, r.lines, v_url);
    if p_dry then
      v_out := v_out || jsonb_build_object('name', r.staff_name, 'count', r.n, 'message', v_msg);
      continue;
    end if;
    v_push := public.admin_points_line_push(r.staff_name, v_msg);
    update public.admin_points_opinion
      set remind_at = now(), remind_count = remind_count + 1, remind_error = coalesce(v_push ->> 'error', '')
      where id = any (r.ids);
    v_out := v_out || jsonb_build_object('name', r.staff_name, 'count', r.n, 'recipients', v_push ->> 'recipients', 'error', v_push ->> 'error');
  end loop;
  return json_build_object('ok', true, 'dry', p_dry, 'list', v_out);
end;
$$;
revoke all on function public.admin_points_opinion_fix_remind(boolean) from public, anon, authenticated;

-- 每天 09:15～20:15 台北（01:15～12:15 UTC）每小時一次
select cron.unschedule(jobid) from cron.job where jobname = 'admin-points-opinion-fix-remind';
select cron.schedule('admin-points-opinion-fix-remind', '15 1-12 * * *', $$select public.admin_points_opinion_fix_remind(false)$$);
