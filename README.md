# 星鴻工具箱 · GitHub Pages 靜態版

**Supabase 帳密登入**（與 Render 相同登入 UI），資料存 Supabase。  
**不含 Express API**：任務板、AI、催收已隱藏。

| 版本 | 網址 |
|------|------|
| **正式站（自訂網域）** | https://toolbox.skyfunsystem.com/ |
| GitHub Pages | https://thinklover.github.io/skyfun-toolbox-pages/ |
| Render 完整版 | https://skyfun-toolbox-api.onrender.com |

> **push 到 `main` 後**，GitHub Actions 會自動部署（約 2 分鐘）。自訂網域需 DNS 指向 GitHub Pages（`toolbox` → CNAME `thinklover.github.io`）。  
> 若仍使用舊版 Cloud Build 主機，可額外執行 `deploy-publish.ps1`；若正式站未更新，請先 **Ctrl+F5**，或暫用 GitHub Pages 網址確認。

## 更新並部署

```powershell
# 1. 複製 webhook 設定（只需第一次）
copy scripts\deploy-webhook.url.example scripts\deploy-webhook.url
# 編輯 deploy-webhook.url 填入 Cloud Build webhook 完整 URL

# 2. 推送 + 觸發 Cloud Build（約 4 分鐘內收 Email）
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-publish.ps1
```

若只改靜態檔、已 push 過，也可手動 POST webhook（`Content-Type: application/json`、body `{}`）。

## 本機預覽（push 前先看效果）

電腦若沒有 Python，請用專案內建方式（只需 Node.js）：

```powershell
# 方式 A：雙擊專案根目錄的 preview-local.bat（會自動開瀏覽器）

# 方式 B：PowerShell
powershell -ExecutionPolicy Bypass -File .\scripts\preview-local.ps1
```

瀏覽器會自動開啟 **http://127.0.0.1:8787/index.html**（若 8787 被占用會自動換埠），確認無誤後再 push。

## 帳號流程

1. 使用者註冊帳密 → 待核准  
2. 管理員 `admin.html` → 輸入 Supabase 後台密碼核准  
3. 核准後可登入使用試算／文件

## 與 Render 差異

- 登入頁、註冊流程：**相同**（Supabase）  
- 任務板／AI／催收：**GitHub Pages 不提供**  
- 帳號資料：**同一套 Supabase**（與 Render 可共用帳號）
