-- 註銷物件申請：每天 19:00（台北）若仍有未完成，LINE 推播提醒指定人員
-- 推播對象：toolbox_accounts.name 在 v_names 內、且已綁定 LINE 的人

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.object_cancel_remind_log (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  pending int not null,
  recipients int not null,
  net_request_id bigint,
  error text not null default ''
);
alter table public.object_cancel_remind_log enable row level security;
revoke all on public.object_cancel_remind_log from anon, authenticated;

create or replace function public.object_cancel_daily_remind(p_dry boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_names text[] := array['邱奕棋'];
  v_token text;
  v_to text[];
  v_pending int;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_lines text;
  v_msg text;
  v_req bigint;
begin
  select count(*) into v_pending from public.object_cancel_requests where status = 'pending';
  if v_pending = 0 then return json_build_object('ok', true, 'pending', 0, 'sent', 0); end if;

  select string_agg(x.line, E'\n' order by x.created_at) into v_lines from (
    select r.created_at,
      format(E'%s. %s\n   %s・%s・%s（已 %s 天）',
        row_number() over (order by r.created_at), r.address, r.dept, r.applicant,
        to_char(r.created_at at time zone 'Asia/Taipei', 'FMMM/FMDD'),
        v_today - (r.created_at at time zone 'Asia/Taipei')::date) as line
    from public.object_cancel_requests r
    where r.status = 'pending'
    order by r.created_at
    limit 20
  ) x;

  v_msg := format(E'🔔 星鴻註銷物件申請：還有 %s 件未完成\n\n%s%s\n\n請到工具箱「行政專區 → 星鴻註銷物件申請」處理，完成後記得勾選完成。',
    v_pending, v_lines, case when v_pending > 20 then format(E'\n…另有 %s 件', v_pending - 20) else '' end);

  select array_agg(distinct b.line_user_id) into v_to
  from public.line_bindings b join public.toolbox_accounts a on a.id = b.user_id
  where a.name = any (v_names) and coalesce(b.line_user_id, '') <> '';

  if p_dry then
    return json_build_object('ok', true, 'dry', true, 'pending', v_pending,
      'recipients', coalesce(array_length(v_to, 1), 0), 'message', v_msg);
  end if;

  select value into v_token from public.line_settings where key = 'channel_access_token';
  if coalesce(v_token, '') = '' or v_to is null then
    insert into public.object_cancel_remind_log (pending, recipients, error)
    values (v_pending, coalesce(array_length(v_to, 1), 0), case when coalesce(v_token, '') = '' then 'LINE 尚未設定' else '提醒對象尚未綁定 LINE' end);
    return json_build_object('ok', false, 'pending', v_pending, 'sent', 0);
  end if;

  select net.http_post(
    url := 'https://api.line.me/v2/bot/message/multicast',
    body := jsonb_build_object('to', to_jsonb(v_to), 'messages', jsonb_build_array(jsonb_build_object('type', 'text', 'text', left(v_msg, 4900)))),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Content-Type', 'application/json')
  ) into v_req;

  insert into public.object_cancel_remind_log (pending, recipients, net_request_id)
  values (v_pending, array_length(v_to, 1), v_req);
  delete from public.object_cancel_remind_log where sent_at < now() - interval '90 days';
  return json_build_object('ok', true, 'pending', v_pending, 'sent', array_length(v_to, 1));
end; $$;
revoke all on function public.object_cancel_daily_remind(boolean) from public, anon, authenticated;

-- pg_cron 以 UTC 計時：11:00 UTC = 台北 19:00
select cron.schedule('object-cancel-daily-remind', '0 11 * * *', $$select public.object_cancel_daily_remind()$$);
