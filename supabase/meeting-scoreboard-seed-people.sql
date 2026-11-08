-- 會議加分人員種子：儲備處經理／營業處經理／營業區協理／行政專員組長（含 job_title）
-- 兩張表（system、monthly）同步；不在名單內的改為 inactive

alter table public.msb_people add column if not exists job_title text not null default '';

create temporary table msb_seed_roster on commit drop as
with ranked as (
  select
    trim(coalesce(nullif(a.name, ''), a.username)) as nm,
    trim(a.job_title) as job_title,
    case trim(a.job_title)
      when '營業區協理' then 1
      when '營業處經理' then 2
      when '儲備處經理' then 3
      when '行政專員組長' then 4
      else 9
    end as title_rank,
    coalesce(nullif(trim(a.team), ''), 'ZZZ') as team_sort,
    row_number() over (
      partition by trim(coalesce(nullif(a.name, ''), a.username))
      order by
        case trim(a.job_title)
          when '營業區協理' then 1
          when '營業處經理' then 2
          when '儲備處經理' then 3
          when '行政專員組長' then 4
          else 9
        end,
        coalesce(nullif(trim(a.team), ''), 'ZZZ')
    ) as rn
  from public.toolbox_accounts a
  where a.status = 'active'
    and trim(coalesce(a.job_title, '')) in ('儲備處經理', '營業處經理', '營業區協理', '行政專員組長')
    and trim(coalesce(nullif(a.name, ''), a.username)) <> ''
),
roster as (
  select nm, job_title, title_rank, team_sort from ranked where rn = 1
),
boards as (
  select unnest(array['system', 'monthly']) as board_key
)
select b.board_key, r.nm, r.job_title, r.title_rank, r.team_sort,
  row_number() over (partition by b.board_key order by r.title_rank, r.team_sort, r.nm)::int as sort_order
from boards b
cross join roster r;

update public.msb_people p
set active = false
where p.board_key in ('system', 'monthly')
  and not exists (
    select 1 from msb_seed_roster t
    where t.board_key = p.board_key and t.nm = p.name
  );

update public.msb_people p
set active = true,
    sort_order = t.sort_order,
    job_title = t.job_title
from msb_seed_roster t
where p.board_key = t.board_key and p.name = t.nm;

insert into public.msb_people (board_key, name, job_title, sort_order, active)
select t.board_key, t.nm, t.job_title, t.sort_order, true
from msb_seed_roster t
where not exists (
  select 1 from public.msb_people p
  where p.board_key = t.board_key and p.name = t.nm
);
