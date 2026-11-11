-- 加減分權限改為預設沒有人。許子緯從計分名單移除。

delete from public.msb_score_editors;

update public.msb_people
set active = false
where name = '許子緯';
