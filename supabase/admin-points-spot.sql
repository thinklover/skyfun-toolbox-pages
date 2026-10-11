-- 小組長抽查：每抽一件記一筆審件抽查（抽查 1、通過才算正確 1），直接計入審件良率。
-- 同一件案件（spot_key）重新判定會覆蓋原本的結果，不會重複計件。
-- 可登錄的人：該行政在人力明細上的組長，或簡為倢、邱奕棋、黃怡婷。

alter table public.admin_points_check add column if not exists spot_key text;
alter table public.admin_points_check add column if not exists spot_node text not null default '';
create unique index if not exists admin_points_check_spot_key_idx
  on public.admin_points_check (spot_key) where spot_key is not null;

create or replace function public.admin_points_spot_check(
  p_token text,
  p_name text,
  p_date date,
  p_key text,
  p_node text,
  p_case text,
  p_passed boolean,
  p_reason text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_me text;
  v_name text := trim(coalesce(p_name, ''));
  v_key text := left(trim(coalesce(p_key, '')), 200);
  v_node text := left(trim(coalesce(p_node, '')), 20);
  v_reason text := left(trim(coalesce(p_reason, '')), 150);
  v_leader text;
  v_note text;
  v_id bigint;
begin
  v_uid := public.admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_me from public.toolbox_accounts a where a.id = v_uid;
  select s.leader into v_leader from public.admin_points_staff s where s.name = v_name;
  if not found then
    return json_build_object('ok', false, 'error', '人力明細查無此人');
  end if;
  if not (v_me in ('簡為倢', '邱奕棋', '黃怡婷') or v_me = trim(coalesce(v_leader, ''))) then
    return json_build_object('ok', false, 'error', '只有這位行政的組長可以登錄抽查結果');
  end if;
  if p_date is null or v_key = '' then
    return json_build_object('ok', false, 'error', '抽查案件資料不完整');
  end if;
  if p_passed is null then
    return json_build_object('ok', false, 'error', '請選通過或未通過');
  end if;
  if not p_passed and v_reason = '' then
    return json_build_object('ok', false, 'error', '未通過請填寫原因');
  end if;
  v_note := left(concat_ws('｜', '小組長抽查', nullif(v_node, ''), nullif(left(trim(coalesce(p_case, '')), 100), ''),
    case when p_passed then '通過' else '未通過：' || v_reason end), 200);
  insert into public.admin_points_check (work_date, staff_name, checked, correct, note, created_by, spot_key, spot_node)
  values (p_date, v_name, 1, case when p_passed then 1 else 0 end, v_note,
          public.admin_qa_reviewer_label(p_token), v_key, v_node)
  on conflict (spot_key) where spot_key is not null do update
    set correct = excluded.correct, note = excluded.note, created_by = excluded.created_by, created_at = now()
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'note', v_note);
end;
$$;

revoke all on function public.admin_points_spot_check(text, text, date, text, text, text, boolean, text) from public;
grant execute on function public.admin_points_spot_check(text, text, date, text, text, text, boolean, text) to anon, authenticated;

-- 讀取點數資料時一併帶出抽查案件代碼，前端用來顯示每件的判定結果
create or replace function public.admin_points_payload(p_start date, p_end date)
returns json
language sql
stable
security definer
set search_path to 'public'
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
        'spotKey', c.spot_key, 'spotNode', c.spot_node
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
