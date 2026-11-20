-- 會議計分：單一 msb_person_patch + 全員可看分數
-- 已於 Supabase 專案套用；此檔供追蹤用。

DROP FUNCTION IF EXISTS public.msb_person_patch(text, bigint, text, uuid);
DROP FUNCTION IF EXISTS public.msb_person_patch(text, bigint, text, uuid, text);
DROP FUNCTION IF EXISTS public.msb_person_patch(text, bigint, text, uuid, text, text);

-- 見 migration msb_patch_unique_and_list_all_scores（僅保留 6 參數版）
-- msb_list：人員／分數不依帳號過濾，canViewAll 固定 true；canEdit 仍由 msb_actor 決定

NOTIFY pgrst, 'reload schema';
