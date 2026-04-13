# 花卉電商網站後端

一個以 Node.js + Express 建構的全端電商網站範例，展示使用者認證、商品管理、購物車、訂單流程等完整電商功能。前後端整合於同一 Express 伺服器，後端提供 REST API，前端使用 EJS 模板加上原生 JS 呼叫 API。

## 技術棧

| 層面 | 技術 |
|------|------|
| 後端框架 | Express 4.x |
| 資料庫 | SQLite（via better-sqlite3） |
| 模板引擎 | EJS 5.x |
| CSS 框架 | Tailwind CSS 4.x |
| 認證 | JWT（jsonwebtoken，HS256，7 天） |
| 密碼雜湊 | bcrypt |
| ID 生成 | uuid v4 |
| API 文件 | swagger-jsdoc + OpenAPI 3.0 |
| 測試框架 | Vitest + supertest |

## 快速開始

### 前置需求

- Node.js 18+
- npm

### 安裝與啟動

```bash
# 1. 複製環境設定
cp .env.example .env

# 2. 編輯 .env，設定 JWT_SECRET
#    JWT_SECRET=your-secret-key-here

# 3. 安裝依賴
npm install

# 4. 啟動（自動建立資料庫 + 種子資料 + 編譯 CSS）
npm start
```

伺服器預設啟動於 `http://localhost:3001`

### 開發模式

```bash
# 終端機 1：啟動伺服器（不 build CSS）
npm run dev:server

# 終端機 2：監看 CSS 變更
npm run dev:css
```

### 種子帳號

系統啟動時自動建立管理員帳號：

| 欄位 | 值（預設） |
|------|-----------|
| Email | admin@hexschool.com |
| Password | 12345678 |
| Role | admin |

可透過 `.env` 的 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 覆寫。

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm start` | 編譯 CSS 後啟動伺服器（production 用） |
| `npm run dev:server` | 僅啟動伺服器（開發用） |
| `npm run dev:css` | 監看並自動重編 Tailwind CSS |
| `npm run css:build` | 一次性編譯並 minify CSS |
| `npm run openapi` | 產生 `openapi.json` API 規格檔 |
| `npm test` | 執行所有整合測試 |

## 頁面路由

| URL | 說明 |
|-----|------|
| `/` | 首頁（商品列表） |
| `/products/:id` | 商品詳情 |
| `/cart` | 購物車 |
| `/checkout` | 結帳 |
| `/login` | 登入頁 |
| `/orders` | 我的訂單 |
| `/orders/:id` | 訂單詳情 |
| `/admin/products` | 後台商品管理 |
| `/admin/orders` | 後台訂單管理 |

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架構、目錄結構、資料流、DB schema、API 路由總覽 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、環境變數、計畫歸檔流程 |
| [FEATURES.md](./FEATURES.md) | 功能清單、行為描述、錯誤碼說明 |
| [TESTING.md](./TESTING.md) | 測試規範、執行方式、測試檔案說明 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新紀錄 |
| [plans/](./plans/) | 開發計畫目錄（進行中） |
| [plans/archive/](./plans/archive/) | 已完成計畫歸檔 |
