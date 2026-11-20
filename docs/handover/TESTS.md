# 離職交接 v2 測試說明（feature/handover-dual-flow）

**環境限制：** 本分支**未**對遠端 Supabase `apply_migration`，也**未**部署 Pages。下列「後端強制」測項需在套用 `supabase/handover-v2.sql` 後執行；未套用前僅能驗證前端 UI 與語法。

## A. 靜態／語法（本機已可跑）

```powershell
cd skyfun-toolbox-pages
node --check js/handover-core.js
node --check js/admin-handover.js
node --check js/biz-handover.js
```

預期：無輸出、exit 0。

## B. 可點擊流程圖（本機 UI）

1. 本機開 http://127.0.0.1:8080/ → 行政／業務「離職交接」。
2. 進案件後應見：**案件頭（總進度％）** → **九節點流程板** → 點節點展開**同頁工作區**（非另開頁）。
3. 節點狀態色文：未開始／處理中／待覆核／已完成／退回補正／逾期／尚未開放；％由資料重算，不可手填。
4. 點「✕」或再點同一節點可收合工作區。
5. 行政：basics／細項（01／02／04）／matters／簽核／accounts／結案 工作區可操作既有表單。
6. 業務：修繕／補助／特別約定分節點；逐案篩選（全部／未完成／待補件／逾期／待覆核）；「定位卡住案件」會捲到焦點案。
7. 帳號停用：可提前填；移交人未簽前該節不得顯示為已完成。
8. 存草稿後重整／重開案件，進度應自 bag 重算（不以 localStorage 當正式進度）。
9. 手機寬（約 390px）：節點改直向單欄；工作區可捲動。
10. 未套用 SQL：應見後端不可用提示；**不得**宣稱可強制結案。

## C. 後端結案門檻（套用 SQL 後）

以 RPC 直接呼叫（繞過前端按鈕）：

| 情境 | 呼叫 | 預期 |
|------|------|------|
| 缺接手人／主管 | `toolbox_handover_close` | `ok=false`，blockers 含缺角色 |
| 細項仍 unset | close | blockers 含未完成細項 |
| 逐案 `handover_done=false` | close | blockers 含逐案未完成 |
| 僅填接手人+期限、`checks.incomplete=true` | matter_upsert 後 close | 不可把未完成當完成；blockers |
| 帳號停用無執行人／證據 | close | blockers 含停用核實 |
| 業務缺電話照會 | close | blockers 含電話照會 |
| 移交人呼叫 close | close | 無權限 |
| 接手人代簽主管 | `confirm_manager` | 僅主管可 |
| 跳關：draft 直接 close | close | 須 manager_review＋確認時間 |
| 退回無理由 | `return` p_reason='' | 必填理由 |
| 簽後竄改 | status=closed 後 item_save | 已鎖定錯誤 |
| 三方同一人 | submit_transferor | 拒絕 |
| 稽核改刪 | UPDATE/DELETE event | trigger 拒絕 |

## D. 舊資料

1. 既有 `toolbox_handover_progress` 列仍在。
2. `toolbox_handover_migrate_v1(kind, person)` 產生 draft case＋matter（`migrated_from=v1`，`handover_done=false`）。
3. 舊五勾選**不**自動視為結案完成。

## E. 前端／列印

1. 列印版含三方簽章欄；流程板／操作鈕於列印時隱藏。
2. blockers 列可點進對應節點。

## F. 本機預覽

```powershell
cd skyfun-toolbox-pages
npx --yes serve -l 8080
# 瀏覽 http://127.0.0.1:8080/
```

**不要** `wrangler pages deploy`。DB migration 等確認後再套。
