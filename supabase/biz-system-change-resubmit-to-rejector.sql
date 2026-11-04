-- 退件後記住層級；填寫人重送回到退件人（非一律回處長）
alter table public.biz_system_change
  add column if not exists reject_return_level text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'biz_system_change_reject_return_level_chk'
  ) then
    alter table public.biz_system_change
      add constraint biz_system_change_reject_return_level_chk
      check (
        reject_return_level is null
        or reject_return_level in ('manager', 'admin', 'super')
      );
  end if;
end $$;

-- 實際函式內容以遠端 migration biz_system_change_resubmit_to_rejector 為準：
-- reject：寫入 reject_return_level = 當下 handler_level
-- resubmit：handler_level 還原為 reject_return_level，並 LINE 通知退件人
