-- 小組長抽查名單：每天每組（每個業績月）存一份，關掉頁面再打開還是同一份，隔天才重抽。
-- 只有簡為倢、邱奕棋、黃怡婷（全部組）與侯思廷、李芷琳（自己那組）可以讀寫。

create table if not exists public.admin_points_spot_draw (
  draw_date date not null,
  month_key text not null,
  leader text not null,
  items jsonb not null default '[]'::jsonb,
  missing jsonb not null default '[]'::jsonb,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  primary key (draw_date, month_key, leader)
);

alter table public.admin_points_spot_draw enable row level security;
revoke all on table public.admin_points_spot_draw from public, anon, authenticated;

create or replace function public.admin_points_spot_me(p_token text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_me text;
begin
  v_uid := public.admin_qa_user_id(p_token);
  if v_uid is null then
    return null;
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_me from public.toolbox_accounts a where a.id = v_uid;
  return v_me;
end;
$$;

revoke all on function public.admin_points_spot_me(text) from public, anon, authenticated;

create or replace function public.admin_points_spot_draws(p_token text)
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
    'date', v_today,
    'draws', coalesce((
      select json_agg(json_build_object(
        'month', d.month_key, 'leader', d.leader, 'items', d.items, 'missing', d.missing,
        'createdBy', d.created_by, 'createdAt', d.created_at
      ))
      from public.admin_points_spot_draw d
      where d.draw_date = v_today and (v_all or d.leader = v_me)
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.admin_points_spot_draws(text) from public;
grant execute on function public.admin_points_spot_draws(text) to anon, authenticated;

create or replace function public.admin_points_spot_draw_save(
  p_token text,
  p_month text,
  p_leader text,
  p_items jsonb,
  p_missing jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := public.admin_points_spot_me(p_token);
  v_leader text := trim(coalesce(p_leader, ''));
  v_month text := left(trim(coalesce(p_month, '')), 10);
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_by text;
  v_at timestamptz;
begin
  if v_me is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  if not (v_me in ('簡為倢', '邱奕棋', '黃怡婷') or (v_me in ('侯思廷', '李芷琳') and v_me = v_leader)) then
    return json_build_object('ok', false, 'error', '沒有這組的抽查權限');
  end if;
  if v_leader = '' or v_month = '' then
    return json_build_object('ok', false, 'error', '請先選組長');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_typeof(coalesce(p_missing, '[]'::jsonb)) <> 'array'
     or length(p_items::text) > 60000 then
    return json_build_object('ok', false, 'error', '抽查名單格式不正確');
  end if;
  v_by := public.admin_qa_reviewer_label(p_token);
  insert into public.admin_points_spot_draw (draw_date, month_key, leader, items, missing, created_by)
  values (v_today, v_month, v_leader, p_items, coalesce(p_missing, '[]'::jsonb), v_by)
  on conflict (draw_date, month_key, leader) do update
    set items = excluded.items, missing = excluded.missing, created_by = excluded.created_by, created_at = now()
  returning created_at into v_at;
  delete from public.admin_points_spot_draw where draw_date < v_today - 30;
  return json_build_object('ok', true, 'date', v_today, 'createdBy', v_by, 'createdAt', v_at);
end;
$$;

revoke all on function public.admin_points_spot_draw_save(text, text, text, jsonb, jsonb) from public;
grant execute on function public.admin_points_spot_draw_save(text, text, text, jsonb, jsonb) to anon, authenticated;
