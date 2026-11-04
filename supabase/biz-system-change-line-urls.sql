-- LINE 通知帶直達工具箱網址
create or replace function public.biz_system_change_page_url()
returns text
language sql
immutable
parallel safe
as $$
  select 'https://toolbox.skyfunsystem.com/?page=business-system-change'::text;
$$;

create or replace function public.biz_system_change_admin_url()
returns text
language sql
immutable
parallel safe
as $$
  select 'https://toolbox.skyfunsystem.com/admin/biz-system-change-dashboard.html'::text;
$$;

-- 實際訊息改寫以遠端 migration 為準：
-- biz_system_change_line_urls / biz_system_change_line_urls_rest
