-- 刪掉「有給點」的那筆後，同一個媒合編號剩下最早的一筆若只是因為重複而被標 0 點，把 1 點改算過去。
-- 後台手動寫了別的不給點原因的，不覆寫。

create or replace function public.admin_points_opinion_delete(p_token text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_kind text;
  v_code text;
  v_no boolean;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  select o.kind, o.no_points, public.admin_points_opinion_code(o.case_no)
    into v_kind, v_no, v_code
  from public.admin_points_opinion o
  where o.id = p_id and o.user_id = v_uid;
  if v_kind is null then return json_build_object('ok', false, 'error', '只能刪除自己填的意見'); end if;
  delete from public.admin_points_opinion where id = p_id and user_id = v_uid;
  if not coalesce(v_no, false) and coalesce(v_code, '') <> '' then
    update public.admin_points_opinion o
    set no_points = false, no_points_reason = ''
    where o.id = (
      select o2.id
      from public.admin_points_opinion o2
      where o2.kind = v_kind
        and public.admin_points_opinion_code(o2.case_no) = v_code
        and o2.no_points
        and o2.no_points_reason = '同一媒合編號只認列第一筆，本筆不給點'
        and not exists (
          select 1 from public.admin_points_opinion o3
          where o3.kind = v_kind
            and public.admin_points_opinion_code(o3.case_no) = v_code
            and (o3.created_at, o3.id) < (o2.created_at, o2.id)
        )
    );
  end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_points_opinion_admin_delete(p_secret text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_code text;
  v_no boolean;
begin
  if not public.toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  select o.kind, o.no_points, public.admin_points_opinion_code(o.case_no)
    into v_kind, v_no, v_code
  from public.admin_points_opinion o
  where o.id = p_id;
  if v_kind is null then return json_build_object('ok', false, 'error', '找不到這筆意見'); end if;
  delete from public.admin_points_opinion where id = p_id;
  if not coalesce(v_no, false) and coalesce(v_code, '') <> '' then
    update public.admin_points_opinion o
    set no_points = false, no_points_reason = ''
    where o.id = (
      select o2.id
      from public.admin_points_opinion o2
      where o2.kind = v_kind
        and public.admin_points_opinion_code(o2.case_no) = v_code
        and o2.no_points
        and o2.no_points_reason = '同一媒合編號只認列第一筆，本筆不給點'
        and not exists (
          select 1 from public.admin_points_opinion o3
          where o3.kind = v_kind
            and public.admin_points_opinion_code(o3.case_no) = v_code
            and (o3.created_at, o3.id) < (o2.created_at, o2.id)
        )
    );
  end if;
  return json_build_object('ok', true);
end;
$$;

-- 目前只剩一筆、卻仍被標成重複的，改回給點（最早那筆就是現在這筆）
with ranked as (
  select id,
         row_number() over (
           partition by kind, public.admin_points_opinion_code(case_no)
           order by created_at, id
         ) as rn
  from public.admin_points_opinion
  where public.admin_points_opinion_code(case_no) <> ''
)
update public.admin_points_opinion o
set no_points = false,
    no_points_reason = ''
from ranked r
where r.id = o.id
  and r.rn = 1
  and o.no_points
  and o.no_points_reason = '同一媒合編號只認列第一筆，本筆不給點';
