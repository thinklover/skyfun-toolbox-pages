-- 財務回報：後台可勾選誰收 LINE 通知（比照註銷物件 notify_object_cancel）
-- 依賴：line_bindings、toolbox_accounts、toolbox_check_admin、fin_report_push_finance

alter table public.line_bindings
  add column if not exists notify_fin_report boolean not null default false;

-- 既有「財務部」已綁定者預設勾選，避免上線後突然沒人收到
update public.line_bindings b
set notify_fin_report = true
from public.toolbox_accounts a
where a.id = b.user_id
  and a.status = 'active'
  and trim(coalesce(a.team, '')) = '財務部'
  and coalesce(b.line_user_id, '') <> ''
  and b.notify_fin_report = false;

create or replace function public.fin_report_push_finance(p_msg text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_to text[];
  v_req bigint;
begin
  select value into v_token from public.line_settings where key = 'channel_access_token';
  if coalesce(v_token, '') = '' then
    return json_build_object('recipients', 0, 'error', 'LINE 尚未設定');
  end if;
  select array_agg(distinct b.line_user_id) into v_to
  from public.line_bindings b
  join public.toolbox_accounts a on a.id = b.user_id
  where a.status = 'active'
    and b.notify_fin_report = true
    and coalesce(b.line_user_id, '') <> '';
  if v_to is null then
    return json_build_object('recipients', 0, 'error', '尚未設定財務回報 LINE 通知對象（請至後台勾選）');
  end if;
  select net.http_post(
    url := 'https://api.line.me/v2/bot/message/multicast',
    body := jsonb_build_object(
      'to', to_jsonb(v_to),
      'messages', jsonb_build_array(jsonb_build_object('type', 'text', 'text', left(p_msg, 4900)))
    ),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Content-Type', 'application/json'
    )
  ) into v_req;
  return json_build_object('recipients', array_length(v_to, 1), 'error', '', 'req', v_req);
end;
$$;

create or replace function public.fin_report_admin_line_list(p_secret text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  return json_build_object('ok', true, 'items', (
    select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
      select b.user_id as "userId",
             a.username,
             a.name,
             a.team,
             b.line_name as "lineName",
             b.notify_fin_report as "notifyFinReport",
             b.bound_at as "boundAt"
      from public.line_bindings b
      join public.toolbox_accounts a on a.id = b.user_id
      where coalesce(b.line_user_id, '') <> ''
      order by b.notify_fin_report desc,
               case when trim(coalesce(a.team, '')) = '財務部' then 0 else 1 end,
               a.team, a.name
    ) x
  ));
end;
$$;

create or replace function public.fin_report_admin_set_line_notify(p_secret text, p_user_id uuid, p_on boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  update public.line_bindings
     set notify_fin_report = coalesce(p_on, false)
   where user_id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這個綁定');
  end if;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.fin_report_admin_line_list(text) to anon, authenticated;
grant execute on function public.fin_report_admin_set_line_notify(text, uuid, boolean) to anon, authenticated;
revoke all on function public.fin_report_push_finance(text) from public, anon, authenticated;
