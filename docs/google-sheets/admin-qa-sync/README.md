# 行政 QA 點數 → Google 試算表同步

將 Supabase 後台檢核通過的行政 QA 點數，寫入試算表：

- 試算表：[每日績效報表](https://docs.google.com/spreadsheets/d/1ujJV7WTgsBtgmPHkmsPg41J9Kjo8TgVNTI_jMvhXfB4/edit?gid=820202601)
- 工作表：**行政填寫-每日績效登錄**（gid=`820202601`）
- 欄位：**紀錄日** + **員工姓名** → 寫入 **行政QA**

## 一次性設定（約 5 分鐘）

### 1. Supabase 執行 SQL

在 Supabase SQL Editor 執行：

`supabase/admin-qa-sheets-sync.sql`

### 2. 試算表綁定 Apps Script

1. 開啟上述 Google 試算表
2. **擴充功能 → Apps Script**
3. 刪除預設程式，貼上 `Code.gs` 全部內容
4. **專案設定 → Script properties** 新增：

| 名稱 | 值 |
|------|-----|
| `SUPABASE_URL` | `https://xpbownhiedurytlyqszu.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon key（與 `js/supabase-config.js` 相同） |
| `ADMIN_SECRET` | 工具箱後台密碼（與 admin.html 相同） |
| `SHEET_NAME` | `行政填寫-每日績效登錄` |
| `SHEET_GID` | `820202601`（**建議一定要設**） |

5. 儲存後執行一次 `syncAdminQaPointsMenu`（需授權；會跳出寫入／對不到結果）

> **找不到工作表？** 試算表選單 → **行政 QA → 列出所有工作表名稱**，把正確名稱填到 `SHEET_NAME`，或直接設 `SHEET_GID=820202601`。
6. 選單 **行政 QA → 安裝每天早上 8:00 自動同步**
7. 若同步異常：選單 **行政 QA → 檢查同步設定**

### 3. （選用）Webhook 立即同步

1. **部署 → 新增部署 → 網路應用程式**
2. 執行身分：我；存取：任何人
3. 複製 Web App URL（舊連結若 404 須重新部署）
4. 在工具箱 `js/supabase-config.js` 設定：

```js
window.SKYFUN_QA_SHEETS_SYNC_URL = 'https://script.google.com/macros/s/xxxx/exec';
```

後台檢核通過後會自動 POST 觸發同步。

## 同步規則

- **點數認列**：只有小組長在後台按 **通過（核准）** 才會產生點數
- **匯入日期**：以 **核准時間（台北日期）** 對應試算表 **紀錄日**
  - 例：A 在 9/14 被核准 → 寫入 A 的 **9/14** 那一列 **行政QA** 欄
- **姓名**：以工具箱帳號 **員工姓名** 對試算表 **員工姓名** 欄
- **行政QA** 寫入該人當日 **累計總點**
- **自動同步**：每天早上 **08:00（台北）** 一次
- 找不到對應列時不標記已同步，下次 08:00 會重試

## 安裝自動同步

試算表選單：**行政 QA → 安裝每天早上 8:00 自動同步**

（若先前裝過「每 5 分鐘」，請重新點一次以改為每日 8:00）

## 手動同步（選用）

試算表選單：**行政 QA → 立即同步點數（手動）**
