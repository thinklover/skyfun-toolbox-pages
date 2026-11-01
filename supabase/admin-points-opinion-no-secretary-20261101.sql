-- 系統/紙本問題選項移除「秘書疏失」
-- 向後相容說明：
-- 1. 既有 system_paper='秘書疏失' 列仍可讀取（無 CHECK、不刪資料）。
-- 2. save / update / admin_update 皆呼叫本函式驗證；只改陣列即可。
-- 3. 編輯其他欄位時 p_system_paper 為 null，不會重驗 system_paper，舊值保留。
-- 4. 前端編輯下拉若原值不在清單會 unshift 顯示；改成其他合法選項可存，不可再選回「秘書疏失」。

create or replace function public.admin_points_opinion_system_papers()
returns text[]
language sql
immutable
as $$
  select array['星鴻系統', '紙本', '營建署/中心系統', '是否待租約']::text[];
$$;
