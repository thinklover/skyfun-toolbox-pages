-- 模擬實作：後台從公司系統抓來的頁面模板與資料欄位結構（房客、預審課程開發用；個資樣式已在後台遮蔽）
create table if not exists public.sim_page_templates (
  name text primary key,
  body text not null,
  captured_at timestamptz not null default now()
);
alter table public.sim_page_templates enable row level security;
revoke all on public.sim_page_templates from anon, authenticated;

create or replace function public.sim_admin_save_template(p_secret text, p_name text, p_body text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not toolbox_check_admin(p_secret) then return json_build_object('ok', false, 'error', '後台密碼錯誤'); end if;
  if coalesce(p_name, '') !~ '^[a-z0-9-]{1,40}$' or coalesce(length(p_body), 0) = 0 or length(p_body) > 3000000 then
    return json_build_object('ok', false, 'error', '模板資料不正確');
  end if;
  insert into public.sim_page_templates (name, body) values (p_name, p_body)
  on conflict (name) do update set body = excluded.body, captured_at = now();
  return json_build_object('ok', true);
end $$;

grant execute on function public.sim_admin_save_template(text, text, text) to anon, authenticated;
