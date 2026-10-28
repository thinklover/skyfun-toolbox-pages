-- 租管績效中心｜不續約明細：是否異常轉業（工具箱存檔）
create table if not exists public.renew_abnormal_transfer (
  match_no text primary key,
  abnormal boolean not null,
  updated_by uuid references public.toolbox_accounts(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.renew_abnormal_transfer enable row level security;
revoke all on public.renew_abnormal_transfer from anon, authenticated;

create or replace function public.renew_abnormal_list(p_token text, p_match_nos text[])
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
    'abnormal', t.abnormal,
    'updatedAt', t.updated_at
  ) order by t.match_no), '[]'::json)
  into v_items
  from public.renew_abnormal_transfer t
  where t.match_no = any(coalesce(p_match_nos, '{}'::text[]));
  return json_build_object('ok', true, 'items', v_items);
end;
$$;

create or replace function public.renew_abnormal_set(p_token text, p_match_no text, p_abnormal boolean)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_no text := trim(coalesce(p_match_no, ''));
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入');
  end if;
  if v_no = '' or char_length(v_no) > 64 then
    return json_build_object('ok', false, 'error', '媒合編號不正確');
  end if;
  if p_abnormal is null then
    delete from public.renew_abnormal_transfer where match_no = v_no;
    return json_build_object('ok', true, 'matchNo', v_no, 'abnormal', null, 'cleared', true);
  end if;
  insert into public.renew_abnormal_transfer (match_no, abnormal, updated_by, updated_at)
  values (v_no, p_abnormal, v_uid, now())
  on conflict (match_no) do update set
    abnormal = excluded.abnormal,
    updated_by = excluded.updated_by,
    updated_at = now();
  return json_build_object('ok', true, 'matchNo', v_no, 'abnormal', p_abnormal, 'cleared', false);
end;
$$;

revoke all on function public.renew_abnormal_list(text, text[]) from public;
revoke all on function public.renew_abnormal_set(text, text, boolean) from public;
grant execute on function public.renew_abnormal_list(text, text[]) to anon, authenticated;
grant execute on function public.renew_abnormal_set(text, text, boolean) to anon, authenticated;
