-- 秘書／行政處理系統欄位：LINE 導向行政專區入口
-- 2026-11-18

create or replace function public.biz_system_change_admin_work_url()
returns text
language sql
immutable
parallel safe
as $$
  select 'https://toolbox.skyfunsystem.com/?page=business-system-change'::text;
$$;

do $patch$
declare
  src text;
  out text;
begin
  src := pg_get_functiondef('public.biz_system_change_transfer(text,bigint,text,text,jsonb)'::regprocedure);

  -- 轉交行政的連結改走行政工作入口（勿改到轉管理員的 admin_url）
  out := replace(
    src,
    E'（詳細資料請至工具箱查看）'' end,\n      public.biz_system_change_page_url()\n    );\n    v_line := public.admin_points_line_push(v_admin, v_msg);',
    E'（詳細資料請至工具箱查看）'' end,\n      public.biz_system_change_admin_work_url()\n    );\n    v_line := public.admin_points_line_push(v_admin, v_msg);'
  );

  if out = src then
    out := replace(
      src,
      'public.biz_system_change_page_url()
    );
    v_line := public.admin_points_line_push(v_admin, v_msg);',
      'public.biz_system_change_admin_work_url()
    );
    v_line := public.admin_points_line_push(v_admin, v_msg);'
    );
  end if;

  out := replace(
    out,
    E'🛠️ 系統欄位更改通報（行政協辦）\\n%s（處長）已轉交案件給您\\n地址：%s',
    E'🛠️ 系統欄位更改通報（行政協辦）\\n%s（處長）已轉交案件給您\\n請至工具箱「行政專區 → 系統欄位更改通報」處理\\n地址：%s'
  );

  if out = src then
    raise exception 'biz_system_change_transfer patch failed: pattern not found';
  end if;

  execute out;
end;
$patch$;

notify pgrst, 'reload schema';
