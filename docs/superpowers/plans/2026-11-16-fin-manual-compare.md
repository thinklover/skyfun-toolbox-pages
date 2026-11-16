# 財務表單：手動輸入＋公司系統比對

## 現況
- 前端：`js/fin-report.js`（`lookupCompanyByAddress` → 選地址 → `loadLeasesForAddress` → `applyLeaseOption` 自動填房東／房客／租期）
- 讀取 API：`skyfun-arrears-rpa` 的 `GET /termination/address-search`、`GET /termination/candidates`（只讀）
- 送出：`fin_report_submit`（Supabase）

## 要改檔案
1. `index.html` — 共用區：改文案、加比對鈕／結果列、社宅包租加租金／管理費／押金／案件類型
2. `js/fin-company-compare.js` — 共用正規化與比對邏輯
3. `js/fin-report.js` — 取消自動帶入、比對流程、送出閘門、列表標記
4. `css/fin-report.css` — 比對結果樣式
5. `admin/fin-report-dashboard.html` — 詳情顯示申請人／系統雙值與「系統資料待更正」
6. `supabase/fin-report-company-compare.sql` — `fin_report_submit` 再驗比對結果

## 套用範圍
- 社宅包租：完整比對欄位＋送出閘門
- 其他共用「查公司／自動帶入」的表單：同樣取消自動帶入，並對房東／房客／可見租期做共用比對閘門

## 不做
- 不寫入公司系統
- 不改財務儀表板流程／權限／報表結構（僅顯示標記與雙值）
