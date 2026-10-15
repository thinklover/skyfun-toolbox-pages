-- 清冊進度：各地區每月、各期別（4期、4-1期、5期）各表單完成打勾（表4、7、9、8、10～13、租押金專戶、附表單6 教育訓練），記錄打勾人與時間

create table if not exists public.admin_points_roster_progress (
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  region text not null,
  period text not null default '5' check (period in ('4', '4-1', '5')),
  item text not null check (item in ('f4', 'f7', 'f9', 'f8', 'f10', 'f11', 'f12', 'f13', 'escrow', 'att6')),
  done_by text not null default '',
  user_id uuid references public.toolbox_accounts(id) on delete set null,
  done_at timestamptz not null default now(),
  primary key (month, region, period, item)
);
alter table public.admin_points_roster_progress enable row level security;
revoke all on public.admin_points_roster_progress from public, anon, authenticated;

create or replace function public.admin_points_roster_progress(p_token text, p_month text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  return json_build_object('ok', true, 'items', coalesce((
    select json_agg(json_build_object('region', p.region, 'period', p.period, 'item', p.item, 'by', p.done_by, 'at', p.done_at) order by p.region, p.period, p.item)
    from public.admin_points_roster_progress p
    where p.month = p_month
  ), '[]'::json));
end;
$$;

create or replace function public.admin_points_roster_progress_set(p_token text, p_month text, p_region text, p_period text, p_item text, p_done boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_name text;
  v_region text := left(trim(coalesce(p_region, '')), 10);
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  if coalesce(p_month, '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then return json_build_object('ok', false, 'error', '月份格式錯誤'); end if;
  if v_region = '' then return json_build_object('ok', false, 'error', '缺少地區'); end if;
  if coalesce(p_period, '') not in ('4', '4-1', '5') then return json_build_object('ok', false, 'error', '期別錯誤'); end if;
  if coalesce(p_item, '') not in ('f4', 'f7', 'f9', 'f8', 'f10', 'f11', 'f12', 'f13', 'escrow', 'att6') then
    return json_build_object('ok', false, 'error', '表單項目錯誤');
  end if;
  if coalesce(p_done, false) then
    select trim(coalesce(a.name, '')) into v_name from public.toolbox_accounts a where a.id = v_uid;
    insert into public.admin_points_roster_progress (month, region, period, item, done_by, user_id)
    values (p_month, v_region, p_period, p_item, coalesce(v_name, ''), v_uid)
    on conflict (month, region, period, item) do nothing;
  else
    delete from public.admin_points_roster_progress where month = p_month and region = v_region and period = p_period and item = p_item;
  end if;
  return public.admin_points_roster_progress(p_token, p_month);
end;
$$;

revoke all on function public.admin_points_roster_progress(text, text) from public;
revoke all on function public.admin_points_roster_progress_set(text, text, text, text, text, boolean) from public;
grant execute on function public.admin_points_roster_progress(text, text) to anon, authenticated;
grant execute on function public.admin_points_roster_progress_set(text, text, text, text, text, boolean) to anon, authenticated;
