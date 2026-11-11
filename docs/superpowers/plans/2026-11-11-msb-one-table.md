# 會議計分中心一頁總表 Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Rebuild 會議計分中心 so the home view is one score/bonus table with quick +/- add-score.

**Architecture:** Replace `#page-meeting-scoreboard` markup, rewrite `js/meeting-scoreboard.js` and `css/meeting-scoreboard.css` against existing `msb_*` RPCs. No schema change in this pass.

**Tech Stack:** Static HTML/CSS/vanilla JS, skyfunAuth RPC, Supabase RPCs already deployed (or fall back gracefully if staff-month SQL missing).

**Spec:** `docs/msb-redesign.md`

## Global Constraints
- 繁體中文 UI；只改會議計分相關檔
- 不引入框架／npm
- 先測測版 preview；正式版等同意
- 金鑰不寫死；不猜 KPI 數字

## Review Focus
- 一般員工只見自己
- 有權限見全員、可編分數／獎金／加減分
- 系統／月會兩表切換不串資料
- 權限 SQL 未套用時淡提示、不擋表
- 手機寬度可捲動看表

---

### Task 1: HTML shell — one table home

**Files:**
- Modify: `index.html` `#page-meeting-scoreboard` block
- Modify: cache busters for `meeting-scoreboard.css` / `.js`

- [ ] Replace sidebar+multi-mode dash with: top nav (總表｜紀錄｜設定), board tabs, month+search, `#msb-people-table`, compact modals for +/- and score/bonus edit
- [ ] Keep records + settings panels simpler
- [ ] Bump `?v=` query

### Task 2: JS rewrite around RPCs

**Files:**
- Rewrite: `js/meeting-scoreboard.js`

**Interfaces (keep):**
- `msb_list`, `msb_entry_save`, `msb_entry_delete`, `msb_month_score_upsert`, `msb_person_add/remove/patch`, `msb_project_add/remove`, `msb_accounts_lookup`
- `window.MeetingScoreboard.onShow`

- [ ] State: view, board, month, q, people rows from list payload
- [ ] Render people table: dept, name, score, bonus, +/- buttons
- [ ] Modals: add entry, edit month score/bonus
- [ ] Records + settings render
- [ ] Soft note if `schemaReady === false`

### Task 3: CSS — dense readable table

**Files:**
- Rewrite: `css/meeting-scoreboard.css` scoped under `#page-meeting-scoreboard`

- [ ] Flat top nav, dense table rows, sticky header, clear +/- buttons
- [ ] Mobile: horizontal scroll table

### Task 4: Ship preview

- [ ] Commit（中文訊息）+ push
- [ ] Deploy `skyfun-toolbox-preview` `--branch main`
- [ ] Report fixed preview URL
