# 離職交接雙流程改造 — 回報

分支：`feature/handover-dual-flow`（僅本地）。**未部署任何遠端／正式版。未套用遠端 Supabase migration。**

## 異動檔案

| 檔案 | 說明 |
|------|------|
| `docs/handover/INVENTORY.md` | 現況盤點與遷移對照 |
| `docs/handover/TESTS.md` | 測試計畫（含 SOP 流程圖驗收） |
| `docs/handover/REPORT.md` | 本回報 |
| `supabase/handover-v2.sql` | case／item／matter／attachment／event／liability + RPCs |
| `supabase/handover-progress.sql` | **未改**（舊表保留） |
| `js/handover-core.js` | ADMIN／BIZ 九節點、`stageStatusOf`／進度、SOP 板 HTML、缺漏→節點 |
| `js/admin-handover.js` | 案件頭＋可點擊流程圖＋同頁工作區（細項／逐案／簽核） |
| `js/biz-handover.js` | 同上＋逐案篩選／定位卡住案件 |
| `css/handover.css` | `bh-sop-*`（對齊 term-sop 版型；限定 `#page-admin-handover`／`#page-business-handover`） |
| `index.html` | 引入 handover-core、cache bust `20261107-sop` |
| 催收相關 | **未改** |

## 可點擊流程圖（本輪）

- 互動：案件頭 → 節點板 → 點開同頁工作區（對齊催收 term-sop；不抽共用、不改 `termination-sop.js`）。
- 行政 9 節點：basics／seals／files／guild／matters／transferor_sign／receiver_review／accounts／manager_close。
- 業務 9 節點：basics／repair／subsidy／special／transferor_sign／receiver_review／manager_call／accounts／manager_close。
- 節點狀態文＋色由 bag 重算（未開始／處理中／待覆核／已完成／退回補正／逾期／尚未開放）；完成比例＝完成數／應做數，禁止手填 %。
- 帳號停用可提前準備；移交人簽核前不得標為已完成。
- 存草稿 ≠ 完成；結案仍走後端 RPC／blockers。

## 資料結構（摘要）

- `toolbox_handover_case`：行政／業務、離職／留停（僅行政）、狀態機、三方、帳號停用核實
- `toolbox_handover_item`：行政細項（種子涵蓋印鑑設備～待辦；停用項需證據）
- `toolbox_handover_matter`：逐案；`contract_active` 與 `handover_done` 分開；`checks.complete`／`incomplete`
- `toolbox_handover_attachment`／`event`／`liability_doc`
- 結案：`toolbox_handover_close` → `toolbox_handover_collect_blockers`（後端強制）
- 遷移：`toolbox_handover_migrate_v1`（不刪舊 progress）

## 測試結果

| 項目 | 結果 |
|------|------|
| `node --check` core／admin／biz | 通過 |
| 本機 `serve -l 8080` | 可開 http://127.0.0.1:8080/ |
| 遠端 RPC 繞過／結案阻擋 | **未測**（尚未 apply migration） |
| 越權簽核／簽後竄改 | SQL 已寫規則；待套用後實測 |
| 流程圖點節點／篩選／手機寬 | CSS＋UI 已就緒；請本機目視 |

## 本機預覽

```powershell
cd C:\Users\USER\Desktop\社宅包租代管\skyfun-toolbox-pages
node --check js/handover-core.js
node --check js/admin-handover.js
node --check js/biz-handover.js
npx --yes serve -l 8080
```

開 http://127.0.0.1:8080/ → 行政專區／業務專區「離職交接」：流程總覽 → 點節點 → 工作區填寫／存草稿。  
未套用 SQL 時會提示後端不可用——**不可宣稱純前端能強制結案**。  
**等你確認再部署／套用遠端 SQL。**

## 可信後端說明

結案／跳關／代簽控管依賴 Supabase security definer RPC。請你確認後再 `apply_migration` `handover-v2.sql`；此前遠端正式環境行為仍為舊五勾選工具。

## 待確認政策

1. 留職停薪：目前僅行政可選；業務是否適用？
2. 疏失責任同意書是否改為結案必要？誰可看？
3. 業務簽核頁「共同承擔賠償」告知文字是否正式顯示？
4. 結案後是否允許仍開著的移交待辦追蹤？
5. 案件清單正式來源（目前：既有授權 Worker＋手填／CSV 精神，標待核）？

## 政策預設（已實作）

- 同意書可關聯、**非**結案條件；不預填 50%／件數。
- 未完成檢核一律擋結案；接手人＋期限不能代替完成。
- 不存明文密碼；停用需執行人／時間／證據。
- 不新爬公司系統；示意案件不當正式資料。
