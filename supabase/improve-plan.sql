-- 行政點數表：改善計畫（評等 D 需每兩週填寫一次；本人填寫，登入者皆可看）

create table if not exists public.admin_points_plans (
  id bigint generated always as identity primary key,
  staff_name text not null,
  perf_year int,
  perf_month int,
  grade text not null default '',
  score numeric,
  focus text not null,
  actions text not null,
  target text not null default '',
  review text not null default '',
  user_id uuid references public.toolbox_accounts(id) on delete set null,
  user_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_points_plans_name_idx on public.admin_points_plans (staff_name, created_at desc);
alter table public.admin_points_plans enable row level security;
revoke all on public.admin_points_plans from anon, authenticated;

create or replace function public.admin_points_plan_list(p_token text, p_name text default '')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_name text := trim(coalesce(p_name, ''));
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  return json_build_object('ok', true, 'items', coalesce((
    select json_agg(row_to_json(x) order by x."createdAt" desc, x.id desc) from (
      select p.id, p.staff_name as name, p.perf_year as "perfYear", p.perf_month as "perfMonth", p.grade, p.score,
        p.focus, p.actions, p.target, p.review, p.user_name as "userName",
        p.created_at as "createdAt", p.updated_at as "updatedAt", (p.user_id = v_uid) as mine
      from public.admin_points_plans p
      where v_name = '' or p.staff_name = v_name
      order by p.created_at desc, p.id desc
      limit case when v_name = '' then 1000 else 60 end
    ) x), '[]'::json));
end; $$;

create or replace function public.admin_points_plan_save(p_token text, p_id bigint, p_data jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid;
  v_acc public.toolbox_accounts%rowtype;
  v_name text;
  v_focus text := left(trim(coalesce(p_data->>'focus', '')), 1000);
  v_actions text := left(trim(coalesce(p_data->>'actions', '')), 2000);
  v_target text := left(trim(coalesce(p_data->>'target', '')), 1000);
  v_review text := left(trim(coalesce(p_data->>'review', '')), 2000);
  v_row public.admin_points_plans%rowtype;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;
  v_name := trim(coalesce(v_acc.name, ''));
  if v_name = '' or not exists (select 1 from public.admin_points_staff where name = v_name) then
    return json_build_object('ok', false, 'error', '人力明細查無你的名字，無法填寫改善計畫');
  end if;
  if v_focus = '' then return json_build_object('ok', false, 'error', '請填寫要改善的項目'); end if;
  if v_actions = '' then return json_build_object('ok', false, 'error', '請填寫具體做法'); end if;
  if char_length(trim(coalesce(p_data->>'focus', ''))) > 300 then return json_build_object('ok', false, 'error', '要改善的項目請在 300 字內'); end if;
  if char_length(trim(coalesce(p_data->>'actions', ''))) > 300 then return json_build_object('ok', false, 'error', '具體做法請在 300 字內'); end if;

  if p_id is null then
    insert into public.admin_points_plans (staff_name, perf_year, perf_month, grade, score, focus, actions, target, review, user_id, user_name)
    values (v_name, nullif(p_data->>'perfYear', '')::int, nullif(p_data->>'perfMonth', '')::int,
      left(coalesce(p_data->>'grade', ''), 2), nullif(p_data->>'score', '')::numeric,
      v_focus, v_actions, v_target, v_review, v_uid, v_name)
    returning * into v_row;
  else
    update public.admin_points_plans set
      focus = v_focus, actions = v_actions, target = v_target, review = v_review, updated_at = now()
    where id = p_id and user_id = v_uid
    returning * into v_row;
    if not found then return json_build_object('ok', false, 'error', '只能修改自己填寫的改善計畫'); end if;
  end if;
  return json_build_object('ok', true, 'id', v_row.id);
end; $$;

create or replace function public.admin_points_plan_delete(p_token text, p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  delete from public.admin_points_plans where id = p_id and user_id = v_uid;
  if not found then return json_build_object('ok', false, 'error', '只能刪除自己填寫的改善計畫'); end if;
  return json_build_object('ok', true);
end; $$;

-- 後台（後台密碼）：看全部人的改善計畫、刪除不當內容
create or replace function public.admin_points_admin_plan_list(p_secret text, p_name text default '')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_name text := trim(coalesce(p_name, ''));
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  return json_build_object('ok', true, 'items', coalesce((
    select json_agg(row_to_json(x) order by x."createdAt" desc, x.id desc) from (
      select p.id, p.staff_name as name, p.perf_year as "perfYear", p.perf_month as "perfMonth", p.grade, p.score,
        p.focus, p.actions, p.target, p.review, p.user_name as "userName",
        p.created_at as "createdAt", p.updated_at as "updatedAt"
      from public.admin_points_plans p
      where v_name = '' or p.staff_name = v_name
      order by p.created_at desc, p.id desc
      limit 3000
    ) x), '[]'::json));
end; $$;

create or replace function public.admin_points_admin_plan_delete(p_secret text, p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  delete from public.admin_points_plans where id = p_id;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆改善計畫'); end if;
  return json_build_object('ok', true);
end; $$;

revoke all on function public.admin_points_admin_plan_list(text, text) from public;
revoke all on function public.admin_points_admin_plan_delete(text, bigint) from public;
grant execute on function public.admin_points_admin_plan_list(text, text) to anon, authenticated;
grant execute on function public.admin_points_admin_plan_delete(text, bigint) to anon, authenticated;

revoke all on function public.admin_points_plan_list(text, text) from public;
revoke all on function public.admin_points_plan_save(text, bigint, jsonb) from public;
revoke all on function public.admin_points_plan_delete(text, bigint) from public;
grant execute on function public.admin_points_plan_list(text, text) to anon, authenticated;
grant execute on function public.admin_points_plan_save(text, bigint, jsonb) to anon, authenticated;
grant execute on function public.admin_points_plan_delete(text, bigint) to anon, authenticated;
