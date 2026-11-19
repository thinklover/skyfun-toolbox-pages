# 業務一次強制綁 LINE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 後台一鍵對「業務處＋已核准＋未綁 LINE」設強制綁定；業務被擋時看到說明退件通知的綁定畫面且不可略過。

**Architecture:** 新增單一 Supabase RPC 批次寫 `force_line_bind`；帳號維護頁加按鈕呼叫；沿用既有 `maybeLineGate`／`forceBind` 閘道，只改強制時文案。不解除既有綁定、不對後勤處別批次。

**Tech Stack:** 靜態 HTML／原生 JS、Supabase Postgres RPC（`toolbox_check_admin`）、既有 `line_bindings`／`force_line_bind`

**Spec:** `docs/superpowers/specs/2026-11-19-force-line-bind-business-design.md`

## Global Constraints

- 業務處（精確名單）：`北一處` `北二處` `北三處` `基一處` `桃一處` `竹一處` `宜一處` `中一處` `中二處` `中三處` `中四處` `中五處` `中六處` `彰一處` `嘉一處` `南一處` `南二處` `高一處` `高二處`
- 排除處別：`行政管理部` `總經理室` `租賃管理部` `電銷部` `客服部` `客滿部` `財務部`（及空處別）
- 只更新 `status = 'active'` 且尚無 `line_bindings` 列的帳號；已綁不動、不 `DELETE` 綁定
- 介面繁體中文；密鑰不寫死；先部署工具箱測試版，正式版等同意
- 只改本計畫列出的檔案；單人強制／取消強制維持現狀

## Review Focus

- 錯誤後台密碼 → RPC 回 `{ ok: false, error: '後台密碼錯誤' }`，前端不改任何列
- 符合條件 0 人 → `{ ok: true, updated: 0 }`，訊息說明無人需強制，不報錯
- 已綁業務／後勤處別／停用帳號 → 不出現在更新集合
- 強制閘道 → 無「稍後再綁」按鈕；略過路徑仍被 `forced` 擋下
- 強制文案 → 必含「退件通知」；加好友／驗證碼步驟不變

---

### Task 1: 批次 RPC SQL

**Files:**
- Create: `supabase/admin-line-force-bind-business.sql`
- Depends on existing: `supabase/admin-line-force-bind.sql`（`force_line_bind`、`toolbox_check_admin`）

**Interfaces:**
- Consumes: `toolbox_check_admin(p_secret text) -> boolean`；`public.toolbox_accounts`；`public.line_bindings`
- Produces: `toolbox_admin_force_line_bind_business(p_secret text) returns json`  
  成功：`{ ok: true, updated: <int>, message: text }`  
  失敗：`{ ok: false, error: text }`

- [ ] **Step 1: 寫 SQL 檔**

函式邏輯：
1. `toolbox_check_admin` 失敗 → 回錯誤 JSON
2. `UPDATE toolbox_accounts SET force_line_bind = true WHERE status = 'active' AND coalesce(force_line_bind,false) = false AND team = ANY(<業務處陣列>) AND NOT EXISTS (SELECT 1 FROM line_bindings b WHERE b.user_id = toolbox_accounts.id)`
3. 以 `GET DIAGNOSTICS`／`RETURNING` 計 `updated`
4. `message`：`updated = 0` → `'目前沒有未綁 LINE 的業務需要強制'`；否則 → `'已對 N 位未綁 LINE 的業務設為下次強制綁定'`
5. `GRANT EXECUTE ... TO anon, authenticated`

- [ ] **Step 2: 乾跑驗證（套用前）**

用 Supabase SQL（唯讀）確認篩選人數與「未綁 LINE」KPI 中業務子集合理：

```sql
select count(*) from public.toolbox_accounts a
where a.status = 'active'
  and a.team = any(array[
    '北一處','北二處','北三處','基一處','桃一處','竹一處','宜一處',
    '中一處','中二處','中三處','中四處','中五處','中六處','彰一處','嘉一處',
    '南一處','南二處','高一處','高二處'
  ])
  and not exists (select 1 from public.line_bindings b where b.user_id = a.id);
```

Expected: 正整數或 0；且小於等於畫面上「未綁 LINE」總數。

- [ ] **Step 3: 套用 migration**

以 Supabase MCP `apply_migration`（或專案慣用方式）執行該檔 DDL／函式定義。  
Expected: 成功；`execute_sql` 可 `select proname from pg_proc where proname = 'toolbox_admin_force_line_bind_business'` 找到一列。

- [ ] **Step 4: Commit**

```bash
git add supabase/admin-line-force-bind-business.sql docs/superpowers/specs/2026-11-19-force-line-bind-business-design.md docs/superpowers/plans/2026-11-19-force-line-bind-business.md
git commit -m "新增業務批次強制綁 LINE 的 Supabase RPC"
```

---

### Task 2: 帳號維護一鍵按鈕

**Files:**
- Modify: `admin/supabase-accounts.html`（工具列約 353–364 行附近；JS 約 `setForceLineBind` 旁）

**Interfaces:**
- Consumes: `toolbox_admin_force_line_bind_business(p_secret)`（Task 1）
- Produces: `#btn-force-line-business` 點擊 → confirm → rpc → `#msg` 顯示 `message` → `loadList()`

- [ ] **Step 1: 工具列加按鈕**

在「同步公司系統職稱」同一 `.sync-actions` 內新增：

```html
<button type="button" class="act-btn act-line" id="btn-force-line-business" title="對所有未綁 LINE 的業務處帳號設為下次強制綁定">強制業務綁 LINE</button>
```

- [ ] **Step 2: 實作 handler**

`forceLineBindBusiness()`：
1. `confirm('確定要對所有「未綁 LINE 的業務」設為下次登入強制綁定嗎？已綁過的與後勤單位不會異動。')`；取消則 return
2. `rpc('toolbox_admin_force_line_bind_business', { p_secret: secret })`
3. `!data?.ok` → throw
4. `#msg` ← `data.message`；`await loadList()`

綁定 click listener（與 `btn-sync-titles` 同區）。

- [ ] **Step 3: 本機／瀏覽器驗收**

登入帳號維護 → 按按鈕 → 取消 confirm 時名單不變；確認後 `#msg` 顯示筆數、列表出現「下次強制綁定」標籤（抽樣幾筆業務未綁帳號）。  
用錯誤密碼 session 不在此測（需重登）；密碼錯時 RPC 應顯示錯誤於 `#msg`。

- [ ] **Step 4: Commit**

```bash
git add admin/supabase-accounts.html
git commit -m "帳號維護：一鍵強制未綁業務綁 LINE"
```

---

### Task 3: 業務強制閘道文案

**Files:**
- Modify: `js/toolbox-auth.js`（`renderLineGate` 內 `sub`／`why`／`skipBtn`，約 794–816 行）

**Interfaces:**
- Consumes: 既有 `lineGate.forced`（來自 `line_my_binding.forceBind`）
- Produces: 強制時文案含退件通知；無 skip 按鈕

- [ ] **Step 1: 改強制文案**

當 `lineGate.forced`：
- `sub`：`管理員要求你必須完成綁定後才能繼續使用`
- `why`：改為說明好處的 HTML 字串（仍放進 `.lg-why`），至少包含：
  - 可收到公會／案件**退件通知**
  - 以及案件相關提醒（可用一句帶過）
  - 請加入「星鴻萬能小幫手」完成綁定才能繼續
- `skipBtn`：維持空字串（不可略過）

非強制（行政管理部軟提醒）文案可維持現狀。

可選：強制時 `.lg-why` 用簡短 `<ul>` 列 2–3 點；樣式沿用現有綠底框，必要時只在 `#toolbox-line-gate-style` 加 `ul` margin，不改其他模組 CSS。

- [ ] **Step 2: 驗收**

對一筆已設 `force_line_bind` 的測試帳號登入工具箱：彈窗出現、文案含「退件通知」、無「稍後再綁」、加好友連結仍為 `@522ubeym`／既有 `LINE_ADD_URL`。

- [ ] **Step 3: Commit**

```bash
git add js/toolbox-auth.js
git commit -m "強制綁 LINE 閘道：補業務退件通知說明"
```

---

### Task 4: 測試版部署與回報

**Files:**
- 無新檔；使用 `scripts/deploy-preview.ps1`（`--branch main` 固定網址）

- [ ] **Step 1: git pull／確認 diff 僅本功能**

Expected：僅 Task 1–3 與 design／plan 相關檔；無誤刪既有功能。

- [ ] **Step 2: 部署 preview**

Run: `skyfun-toolbox-pages/scripts/deploy-preview.ps1`  
回報固定網址：`https://skyfun-toolbox-preview.pages.dev/`

- [ ] **Step 3: 驗收清單**

1. 後台帳號維護可見「強制業務綁 LINE」
2. 執行後未綁業務有強制標；已綁／後勤無異動
3. 該業務登入主站被擋，文案含退件通知，不可略過
4. 綁定完成後可進工具箱，`force_line_bind` 被既有 trigger 清掉

- [ ] **Step 4: Commit 若部署腳本無改動則略；push 依專案規則**

```bash
git push
```

不上正式版，除非負責人另外 OK。
