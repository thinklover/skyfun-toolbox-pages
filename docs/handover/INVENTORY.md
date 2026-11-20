# 離職交接現況盤點與遷移對照（feature/handover-dual-flow）

凍結時間：2026-11-07。分支：`feature/handover-dual-flow`。**不部署遠端。**

## 現況檔案

| 路徑 | 說明 |
|------|------|
| `js/admin-handover.js` | 行政：Worker 經手清單 + 五勾選 + LS／RPC 同步 |
| `js/biz-handover.js` | 業務：契約／Worker＋匯入 + 五勾選 + LS／RPC 同步 |
| `css/handover.css` | 共用樣式 |
| `supabase/handover-progress.sql` | `toolbox_handover_progress` + list／set |
| `index.html` | `#page-admin-handover`／`#page-business-handover` |

## 舊資料鍵

- 表：`toolbox_handover_progress(kind, person, match_no, receiver, checks, note, updated_by, updated_at)`
- `kind`：`admin`｜`biz`
- 行政 `match_no`：實際為 `caseNo|kind|handledAt|address` 複合鍵
- 業務 `match_no`：優先 `addr:…`，否則媒合編號
- 舊 `CHECKS`（僅參考，不作為結案依據）：
  - admin：`pendingAudit, guildRoster, repairTerm, complaintPetition, filesAccounts`
  - biz：`sysTransfer, lineHandover, keysDocs, arrearsRenew, repairCancel`

## 新結構對照

| 舊 | 新 |
|----|-----|
| 隱式「選姓名＋勾選」 | `toolbox_handover_case`（一筆離職交接） |
| `checks` 五布林 | `toolbox_handover_item`（細項）＋`toolbox_handover_matter`（逐案） |
| `receiver` | case／matter 的 `receiver_name`；三方角色分開 |
| 無簽核 | case.`status` + 簽核欄位 + event 確認 |
| 無稽核 | `toolbox_handover_event`（不可改） |
| 無附件 | `toolbox_handover_attachment` |
| — | `toolbox_handover_liability_doc`（可選同意書） |

遷移：`toolbox_handover_migrate_v1` 為每人／kind 建 draft case，舊列寫入 matter（`migrated_from=v1`，`pending_verify=true`）。**不刪** `toolbox_handover_progress`。

## 可信後端說明

結案／跳關／代簽阻擋必須靠 Supabase security definer RPC。未套用 `supabase/handover-v2.sql` 前，遠端無法強制；純前端停用按鈕**不足以**宣稱控管。
