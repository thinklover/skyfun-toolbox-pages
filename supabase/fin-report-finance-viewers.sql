-- 財務前台全案進度：財務部／行政／總經理室，以及黃怡婷、邱奕棋、簡為倢
create or replace function public.fin_report_is_finance(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.toolbox_accounts a
    where a.id = p_uid
      and a.status = 'active'
      and (
        trim(coalesce(a.team, '')) = '財務部'
        or trim(coalesce(a.team, '')) = '行政管理部'
        or trim(coalesce(a.team, '')) = '總經理室'
        or trim(coalesce(a.name, '')) in ('黃怡婷', '邱奕棋', '簡為倢')
      )
  );
$$;

notify pgrst, 'reload schema';
