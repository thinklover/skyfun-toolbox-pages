-- 「已修正」打勾與 LINE 提醒擴大到清冊意見（提醒對象同樣是填寫意見的人）

drop index if exists public.admin_points_opinion_open_idx;
create index if not exists admin_points_opinion_open2_idx on public.admin_points_opinion (staff_name) where fixed_at is null;

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
    where id = p_id and kind in ('case', 'roster') and (user_id = v_uid or staff_name = v_name)
    returning * into v_row;
  if v_row.id is null then return json_build_object('ok', false, 'error', '只能勾選自己填的意見'); end if;
  return json_build_object('ok', true, 'opinion', public.admin_points_opinion_json(v_row));
end;
$$;
revoke all on function public.admin_points_opinion_fix(text, bigint, boolean) from public;
grant execute on function public.admin_points_opinion_fix(text, bigint, boolean) to anon, authenticated;

/** 自己還沒打勾「已修正」的案件／清冊意見（不限業績月） */
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
    where o.kind in ('case', 'roster') and o.fixed_at is null and (o.user_id = v_uid or o.staff_name = v_name)
      and o.created_at >= public.admin_points_opinion_remind_from()
  ), '[]'::json));
end;
$$;
revoke all on function public.admin_points_opinion_open(text) from public;
grant execute on function public.admin_points_opinion_open(text) to anon, authenticated;

/** 每小時跑：填寫滿一天還沒打勾的案件／清冊意見，同一個填寫人合併成一則 LINE；同一筆每天最多提醒一次 */
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
  v_where text;
begin
  for r in
    select o.staff_name,
           array_agg(o.id order by o.created_at) ids,
           string_agg(format('・%s %s%s（%s 填寫%s）',
             case o.kind when 'roster' then '清冊' else '案件' end,
             case when o.kind = 'roster' and o.roster_period <> '' then o.roster_period || ' ' else '' end,
             coalesce(nullif(o.case_no, ''), o.region),
             to_char(o.created_at at time zone 'Asia/Taipei', 'FMMM/FMDD'),
             coalesce('，' || nullif(o.category, ''), '')), E'\n' order by o.created_at) lines,
           count(*) n,
           bool_or(o.kind = 'case') has_case,
           bool_or(o.kind = 'roster') has_roster
    from public.admin_points_opinion o
    where o.kind in ('case', 'roster') and o.fixed_at is null
      and o.created_at >= public.admin_points_opinion_remind_from()
      and o.created_at <= now() - interval '1 day'
      and (o.remind_at is null or o.remind_at <= now() - interval '23 hours')
    group by o.staff_name
  loop
    v_where := concat_ws('、',
      case when r.has_case then '「📝 填寫案件意見」' end,
      case when r.has_roster then '「📝 填寫清冊意見」' end);
    v_msg := format(E'⏰ 公會意見還沒修正\n%s 您好：\n您填寫的公會意見已超過一天，還沒打勾「已修正」（%s 筆）：\n%s\n\n請盡快修正，完成後到工具箱「行政績效中心」→ %s，在清單後面勾「已修正」。\n%s',
      r.staff_name, r.n, r.lines, v_where, v_url);
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
