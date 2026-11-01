-- 離職交接：業務／行政共用進度（工具箱存檔，全員可見；不含身分證／證照）
create table if not exists public.toolbox_handover_progress (
  kind text not null,
  person text not null,
  match_no text not null,
  receiver text not null default '',
  checks jsonb not null default '{}'::jsonb,
  note text not null default '',
  updated_by uuid references public.toolbox_accounts(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (kind, person, match_no),
  constraint toolbox_handover_progress_kind_check check (kind in ('biz', 'admin'))
);
alter table public.toolbox_handover_progress enable row level security;
revoke all on public.toolbox_handover_progress from anon, authenticated;

create or replace function public.toolbox_handover_progress_list(p_token text, p_kind text, p_person text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_kind text := trim(coalesce(p_kind, ''));
  v_person text := trim(coalesce(p_person, ''));
  v_items json;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  if v_kind not in ('biz', 'admin') then
    return json_build_object('ok', false, 'error', 'kind 不正確');
  end if;
  if v_person = '' or char_length(v_person) > 64 then
    return json_build_object('ok', false, 'error', '人員姓名不正確');
  end if;
  select coalesce(json_agg(json_build_object(
    'matchNo', t.match_no,
    'receiver', t.receiver,
    'checks', t.checks,
    'note', t.note,
    'updatedAt', t.updated_at,
    'updatedByName', coalesce(nullif(a.name, ''), a.username)
  ) order by t.match_no), '[]'::json)
    into v_items
  from public.toolbox_handover_progress t
  left join public.toolbox_accounts a on a.id = t.updated_by
  where t.kind = v_kind
    and t.person = v_person;
  return json_build_object('ok', true, 'items', v_items);
end;
$$;

create or replace function public.toolbox_handover_progress_set(
  p_token text,
  p_kind text,
  p_person text,
  p_match_no text,
  p_receiver text,
  p_checks jsonb,
  p_note text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_kind text := trim(coalesce(p_kind, ''));
  v_person text := trim(coalesce(p_person, ''));
  v_no text := trim(coalesce(p_match_no, ''));
  v_receiver text := trim(coalesce(p_receiver, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_checks jsonb;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  if v_kind not in ('biz', 'admin') then
    return json_build_object('ok', false, 'error', 'kind 不正確');
  end if;
  if v_person = '' or char_length(v_person) > 64 then
    return json_build_object('ok', false, 'error', '人員姓名不正確');
  end if;
  if v_no = '' or char_length(v_no) > 200 then
    return json_build_object('ok', false, 'error', '媒合編號不正確');
  end if;
  if char_length(v_receiver) > 64 then
    return json_build_object('ok', false, 'error', '接手人過長');
  end if;
  if char_length(v_note) > 500 then
    return json_build_object('ok', false, 'error', '備註最多 500 字');
  end if;
  if p_checks is null or jsonb_typeof(p_checks) <> 'object' then
    v_checks := '{}'::jsonb;
  else
    v_checks := p_checks;
  end if;
  insert into public.toolbox_handover_progress (
    kind, person, match_no, receiver, checks, note, updated_by, updated_at
  )
  values (
    v_kind, v_person, v_no, v_receiver, v_checks, v_note, v_uid, now()
  )
  on conflict (kind, person, match_no) do update set
    receiver = excluded.receiver,
    checks = excluded.checks,
    note = excluded.note,
    updated_by = excluded.updated_by,
    updated_at = now();
  return json_build_object(
    'ok', true,
    'matchNo', v_no,
    'receiver', v_receiver,
    'checks', v_checks,
    'note', v_note
  );
end;
$$;

revoke all on function public.toolbox_handover_progress_list(text, text, text) from public;
revoke all on function public.toolbox_handover_progress_set(text, text, text, text, text, jsonb, text) from public;
grant execute on function public.toolbox_handover_progress_list(text, text, text) to anon, authenticated;
grant execute on function public.toolbox_handover_progress_set(text, text, text, text, text, jsonb, text) to anon, authenticated;
