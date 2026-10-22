-- 結訓日有兩筆時抓最新：同一人重訓，試算表姓名會加尾碼（如「謝政宇1」）
-- 比對時去掉姓名尾巴的數字，同名（且處別相同優先）多列取結訓日最新的一列

create or replace function public.newbie_train_match(p_name text, p_team text)
returns table (train_end date, status text, dept text, matched_by text)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select nullif(regexp_replace(trim(coalesce(p_name, '')), '\s*[0-9０-９]+$', ''), '') as want
  ), c as (
    select r.*, r.dept_norm = coalesce(trim(p_team), '') as dept_hit
    from public.newbie_train_roster r, base
    where base.want is not null
      and regexp_replace(trim(r.name), '\s*[0-9０-９]+$', '') = base.want
  ), pick as (
    select c.*, 'name_dept'::text as how from c where dept_hit
    union all
    select c.*, 'name'::text from c
    where not exists (select 1 from c where dept_hit)
      and (coalesce(trim(p_team), '') = '' or (trim(p_team) ~ '處$' and c.dept_norm !~ '處$'))
  )
  select train_end, status, dept, how
  from pick
  order by (how = 'name_dept') desc, train_end desc nulls last, row_no desc
  limit 1
$$;
revoke all on function public.newbie_train_match(text, text) from public, anon, authenticated;
