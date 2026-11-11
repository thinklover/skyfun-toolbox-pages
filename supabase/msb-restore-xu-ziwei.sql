-- 許子緯（儲備處經理）只在 monthly 且已停用，總表不會列出。改回在職並補 system 列。

update public.msb_people
set active = true
where name = '許子緯'
  and board_key = 'monthly'
  and active = false;

insert into public.msb_people (board_key, name, job_title, sort_order, active, account_id, department)
select 'system', p.name, p.job_title,
  coalesce((select max(sort_order) from public.msb_people where board_key = 'system'), 0) + 1,
  true, p.account_id, coalesce(p.department, '')
from public.msb_people p
where p.name = '許子緯' and p.board_key = 'monthly'
  and not exists (
    select 1 from public.msb_people s where s.board_key = 'system' and s.name = '許子緯'
  );
