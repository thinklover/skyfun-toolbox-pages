-- 小組長抽查：每週固定抽查日（預設週二、週五）＋ LINE 每天提醒一次
-- 提醒對象＝人力明細「區域主管」欄的組長（要先在工具箱綁定星鴻萬能小幫手）。
-- 每天 09:30（台北）檢查：本週到今天為止應抽幾次、實際抽了幾天、已抽的案件還有幾件沒判定；沒做完就推一則 LINE。

create table if not exists public.admin_points_spot_rule (
  id int primary key default 1 check (id = 1),
  days int[] not null default '{2,5}',
  updated_at timestamptz not null default now()
);
alter table public.admin_points_spot_rule enable row level security;
revoke all on public.admin_points_spot_rule from anon, authenticated;
insert into public.admin_points_spot_rule (id) values (1) on conflict (id) do nothing;

create table if not exists public.admin_points_spot_remind_log (
  id bigserial primary key,
  sent_at timestamptz not null default now(),
  leader text not null,
  recipients int not null default 0,
  message text not null default '',
  net_request_id bigint,
  error text not null default ''
);
alter table public.admin_points_spot_remind_log enable row level security;
revoke all on public.admin_points_spot_remind_log from anon, authenticated;

create or replace function public.admin_points_spot_days()
returns int[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select days from public.admin_points_spot_rule where id = 1), '{2,5}'::int[]);
$$;
revoke all on function public.admin_points_spot_days() from public, anon, authenticated;

/** 每位組長本週（週一起）到今天的抽查進度 */
create or replace function public.admin_points_spot_progress(p_today date)
returns table (leader text, due int, done int, drawn_today boolean, unjudged int)
language sql
stable
security definer
set search_path = public
as $$
  with d as (select public.admin_points_spot_days() as days),
  wk as (select p_today - (extract(isodow from p_today)::int - 1) as mon),
  leaders as (
    select distinct s.leader from public.admin_points_staff s
    where coalesce(s.leader, '') <> '' and s.status = '在職' and s.kind <> '工讀生'
  )
  select l.leader,
    (select count(*)::int from unnest(d.days) x where x <= extract(isodow from p_today)::int),
    (select count(distinct sd.draw_date)::int from public.admin_points_spot_draw sd
      where sd.leader = l.leader and sd.draw_date between wk.mon and p_today),
    exists (select 1 from public.admin_points_spot_draw sd where sd.leader = l.leader and sd.draw_date = p_today),
    (select count(*)::int from public.admin_points_spot_draw sd, jsonb_array_elements(sd.items) it
      where sd.leader = l.leader and sd.draw_date between wk.mon and p_today
        and not exists (select 1 from public.admin_points_check c where c.spot_key = it ->> 'key'))
  from leaders l, d, wk;
$$;
revoke all on function public.admin_points_spot_progress(date) from public, anon, authenticated;

/** 工具箱「小組長抽查」顯示用：抽查日與本週進度 */
create or replace function public.admin_points_spot_week(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me text := public.admin_points_spot_me(p_token);
  v_all boolean;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  if v_me is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  v_all := v_me in ('簡為倢', '邱奕棋', '黃怡婷');
  if not (v_all or v_me in ('侯思廷', '李芷琳')) then
    return json_build_object('ok', false, 'error', '沒有小組長抽查權限');
  end if;
  return json_build_object(
    'ok', true,
    'today', v_today,
    'days', public.admin_points_spot_days(),
    'leaders', coalesce((
      select json_agg(json_build_object('leader', p.leader, 'due', p.due, 'done', p.done, 'drawnToday', p.drawn_today, 'unjudged', p.unjudged))
      from public.admin_points_spot_progress(v_today) p
      where v_all or p.leader = v_me
    ), '[]'::json)
  );
end;
$$;

/** 每天提醒一次；p_dry = true 只回傳訊息不推播 */
create or replace function public.admin_points_spot_daily_remind(p_dry boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_dow int := extract(isodow from v_today)::int;
  v_days int[] := public.admin_points_spot_days();
  v_names text[] := array['一', '二', '三', '四', '五', '六', '日'];
  v_day_text text;
  v_token text;
  v_url text := 'https://toolbox.skyfunsystem.com/?page=admin-points';
  v_out jsonb := '[]'::jsonb;
  v_to text[];
  v_req bigint;
  v_msg text;
  v_lines text[];
  p record;
begin
  if not (v_dow = any (v_days)) and v_dow in (6, 7) then
    return json_build_object('ok', true, 'skipped', '週末', 'sent', 0);
  end if;
  select string_agg('週' || v_names[x], '、' order by x) into v_day_text from unnest(v_days) x;
  select value into v_token from public.line_settings where key = 'channel_access_token';

  for p in select * from public.admin_points_spot_progress(v_today) order by leader loop
    continue when p.due = 0;
    continue when p.done >= p.due and p.unjudged = 0;
    v_lines := array[]::text[];
    if v_dow = any (v_days) and not p.drawn_today then
      v_lines := v_lines || format('今天（%s 週%s）是抽查日，請抽查組員前一天審過的案件。', to_char(v_today, 'FMMM/FMDD'), v_names[v_dow]);
    elsif p.done < p.due then
      v_lines := v_lines || format('本週還有 %s 次抽查沒做（應抽 %s 次，已抽 %s 次）。', p.due - p.done, p.due, p.done);
    end if;
    if p.unjudged > 0 then
      v_lines := v_lines || format('已抽出的案件還有 %s 件沒判定「通過／未通過」。', p.unjudged);
    end if;
    v_msg := format(E'🔍 小組長抽查提醒\n%s 您好：\n%s\n\n抽查日：每%s，每週 %s 次。\n請到工具箱「行政績效中心 → 小組長抽查」按「抽查全部組員」並完成判定。\n%s',
      p.leader, array_to_string(v_lines, E'\n'), v_day_text, coalesce(array_length(v_days, 1), 0), v_url);

    select array_agg(distinct b.line_user_id) into v_to
    from public.line_bindings b join public.toolbox_accounts a on a.id = b.user_id
    where trim(coalesce(nullif(a.name, ''), a.username)) = p.leader and coalesce(b.line_user_id, '') <> '';

    if p_dry then
      v_out := v_out || jsonb_build_object('leader', p.leader, 'recipients', coalesce(array_length(v_to, 1), 0), 'message', v_msg);
      continue;
    end if;
    if coalesce(v_token, '') = '' or v_to is null then
      insert into public.admin_points_spot_remind_log (leader, recipients, message, error)
      values (p.leader, 0, v_msg, case when coalesce(v_token, '') = '' then 'LINE 尚未設定' else '組長尚未綁定 LINE' end);
      v_out := v_out || jsonb_build_object('leader', p.leader, 'recipients', 0);
      continue;
    end if;
    select net.http_post(
      url := 'https://api.line.me/v2/bot/message/multicast',
      body := jsonb_build_object('to', to_jsonb(v_to), 'messages', jsonb_build_array(jsonb_build_object('type', 'text', 'text', left(v_msg, 4900)))),
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Content-Type', 'application/json')
    ) into v_req;
    insert into public.admin_points_spot_remind_log (leader, recipients, message, net_request_id)
    values (p.leader, array_length(v_to, 1), v_msg, v_req);
    v_out := v_out || jsonb_build_object('leader', p.leader, 'recipients', array_length(v_to, 1));
  end loop;

  if not p_dry then
    delete from public.admin_points_spot_remind_log where sent_at < now() - interval '90 days';
  end if;
  return json_build_object('ok', true, 'dry', p_dry, 'today', v_today, 'list', v_out);
end;
$$;
revoke all on function public.admin_points_spot_daily_remind(boolean) from public, anon, authenticated;

/** 後台：讀／改抽查日（p_days 為 null 只讀），並附今天的提醒預覽與最近提醒紀錄 */
create or replace function public.admin_points_spot_rule_admin(p_secret text, p_days int[] default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days int[];
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if p_days is not null then
    select coalesce(array_agg(distinct x order by x), '{}') into v_days from unnest(p_days) x where x between 1 and 7;
    if coalesce(array_length(v_days, 1), 0) = 0 then
      return json_build_object('ok', false, 'error', '至少要選一天');
    end if;
    update public.admin_points_spot_rule set days = v_days, updated_at = now() where id = 1;
  end if;
  return json_build_object(
    'ok', true,
    'days', public.admin_points_spot_days(),
    'preview', public.admin_points_spot_daily_remind(true),
    'log', coalesce((
      select json_agg(json_build_object('at', l.sent_at, 'leader', l.leader, 'recipients', l.recipients, 'error', l.error) order by l.sent_at desc)
      from (select * from public.admin_points_spot_remind_log order by sent_at desc limit 20) l
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.admin_points_spot_week(text) to anon, authenticated;
grant execute on function public.admin_points_spot_rule_admin(text, int[]) to anon, authenticated;

-- 每天 09:30 台北 = 01:30 UTC
select cron.unschedule(jobid) from cron.job where jobname = 'admin-points-spot-remind';
select cron.schedule('admin-points-spot-remind', '30 1 * * *', $$select public.admin_points_spot_daily_remind(false)$$);
