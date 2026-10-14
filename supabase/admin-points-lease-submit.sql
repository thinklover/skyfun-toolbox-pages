-- 案件繳交稽核：起租日在週期內的已生效合約（應繳），行政逐件打勾表示已繳交；記打勾人員與日期

create table if not exists public.admin_points_lease_submit (
  contract_id text primary key,
  match_no text not null default '',
  region text not null default '',
  lease_start date,
  checked_by text not null,
  user_id uuid references public.toolbox_accounts(id) on delete set null,
  checked_at timestamptz not null default now()
);
create index if not exists admin_points_lease_submit_start_idx on public.admin_points_lease_submit (lease_start);
alter table public.admin_points_lease_submit enable row level security;
revoke all on public.admin_points_lease_submit from public, anon, authenticated;

create or replace function public.admin_points_lease_checks(p_token text, p_start date, p_end date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.admin_qa_user_id(p_token) is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  return json_build_object('ok', true, 'checks', coalesce((
    select json_agg(json_build_object('id', s.contract_id, 'by', s.checked_by, 'at', s.checked_at) order by s.checked_at)
    from public.admin_points_lease_submit s
    where s.lease_start between p_start and p_end
  ), '[]'::json));
end;
$$;

-- p_checked = true 打勾（已繳）；false 取消
create or replace function public.admin_points_lease_check(p_token text, p_id text, p_no text, p_region text, p_lease_start date, p_checked boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_name text;
  v_at timestamptz;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入工具箱'); end if;
  if coalesce(trim(p_id), '') = '' then return json_build_object('ok', false, 'error', '資料錯誤'); end if;
  if not coalesce(p_checked, false) then
    delete from public.admin_points_lease_submit where contract_id = trim(p_id);
    return json_build_object('ok', true);
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username)) into v_name from public.toolbox_accounts a where a.id = v_uid;
  insert into public.admin_points_lease_submit (contract_id, match_no, region, lease_start, checked_by, user_id)
  values (trim(p_id), left(trim(coalesce(p_no, '')), 60), left(trim(coalesce(p_region, '')), 10), p_lease_start, coalesce(v_name, ''), v_uid)
  on conflict (contract_id) do update set
    match_no = excluded.match_no, region = excluded.region, lease_start = excluded.lease_start,
    checked_by = excluded.checked_by, user_id = excluded.user_id, checked_at = now()
  returning checked_at into v_at;
  return json_build_object('ok', true, 'by', v_name, 'at', v_at);
end;
$$;

revoke all on function public.admin_points_lease_checks(text, date, date) from public;
revoke all on function public.admin_points_lease_check(text, text, text, text, date, boolean) from public;
grant execute on function public.admin_points_lease_checks(text, date, date) to anon, authenticated;
grant execute on function public.admin_points_lease_check(text, text, text, text, date, boolean) to anon, authenticated;
