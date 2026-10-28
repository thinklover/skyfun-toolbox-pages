-- 租管績效中心｜不續約明細：催收狀態（工具箱存檔，全員可見）
create table if not exists public.renew_collect_status (
  match_no text primary key,
  status text not null,
  updated_by uuid references public.toolbox_accounts(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint renew_collect_status_whitelist check (
    status in (
      '未處理完成',
      '未繳款',
      '申請調解',
      '強制執行',
      '還款協議+本票',
      '請法務協助',
      '解約',
      '固定時間匯款',
      '處理進度中',
      '已匯款'
    )
  )
);
alter table public.renew_collect_status enable row level security;
revoke all on public.renew_collect_status from anon, authenticated;

create or replace function public.renew_collect_status_list(p_token text, p_match_nos text[])
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_items json;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  select coalesce(json_agg(json_build_object(
    'matchNo', t.match_no,
    'status', t.status,
    'updatedAt', t.updated_at
  ) order by t.match_no), '[]'::json)
    into v_items
  from public.renew_collect_status t
  where t.match_no = any(coalesce(p_match_nos, '{}'::text[]));
  return json_build_object('ok', true, 'items', v_items);
end;
$$;

create or replace function public.renew_collect_status_set(p_token text, p_match_no text, p_status text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_no text := trim(coalesce(p_match_no, ''));
  v_status text := trim(coalesce(p_status, ''));
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  if v_no = '' or char_length(v_no) > 64 then
    return json_build_object('ok', false, 'error', '媒合編號不正確');
  end if;
  if v_status = '' then
    delete from public.renew_collect_status where match_no = v_no;
    return json_build_object('ok', true, 'matchNo', v_no, 'status', null, 'cleared', true);
  end if;
  if v_status not in (
    '未處理完成',
    '未繳款',
    '申請調解',
    '強制執行',
    '還款協議+本票',
    '請法務協助',
    '解約',
    '固定時間匯款',
    '處理進度中',
    '已匯款'
  ) then
    return json_build_object('ok', false, 'error', '催收狀態不在允許清單');
  end if;
  insert into public.renew_collect_status (match_no, status, updated_by, updated_at)
  values (v_no, v_status, v_uid, now())
  on conflict (match_no) do update set
    status = excluded.status,
    updated_by = excluded.updated_by,
    updated_at = now();
  return json_build_object('ok', true, 'matchNo', v_no, 'status', v_status, 'cleared', false);
end;
$$;

revoke all on function public.renew_collect_status_list(text, text[]) from public;
revoke all on function public.renew_collect_status_set(text, text, text) from public;
grant execute on function public.renew_collect_status_list(text, text[]) to anon, authenticated;
grant execute on function public.renew_collect_status_set(text, text, text) to anon, authenticated;
