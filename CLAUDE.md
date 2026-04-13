# CLAUDE.md

## 專案概述

花卉電商網站後端 — Node.js + Express + SQLite (better-sqlite3) + EJS 模板引擎 + Tailwind CSS

前後端整合於同一個 Express 伺服器：API 路由以 `/api/` 為前綴，頁面路由直接回傳 EJS 渲染的 HTML。資料庫採用 SQLite 單檔架構，啟動時自動建表並植入種子資料。

## 常用指令

```bash
# 啟動（先 build CSS，再啟動伺服器）
npm start

# 開發模式（僅啟動伺服器，不 build CSS）
npm run dev:server

# 監看 CSS 變更並重新編譯
npm run dev:css

# 執行所有測試
npm test

# 產生 openapi.json（需先有 swagger-config.js）
npm run openapi
```

## 關鍵規則

- **統一回應格式**：所有 API 回傳 `{ data, error, message }` 三欄位結構，成功時 `error: null`，失敗時 `data: null`
- **購物車雙模式認證**：購物車路由同時接受 `Authorization: Bearer <JWT>` 或 `X-Session-Id: <uuid>` header；若帶了 Bearer token 但 token 無效，直接回 401，不 fallback 到 session
- **訂單建立使用 SQLite transaction**：建立訂單時，插入訂單、插入訂單明細、扣減庫存、清空購物車在同一個 transaction 中原子執行
- **bcrypt rounds 在測試環境為 1**：`src/database.js` 的 seedAdminUser 依 `NODE_ENV === 'test'` 決定 salt rounds，避免測試速度過慢
- **功能開發使用 docs/plans/ 記錄計畫；完成後移至 docs/plans/archive/**

## 詳細文件

- [./docs/README.md](./docs/README.md) — 項目介紹與快速開始
- [./docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架構、目錄結構、資料流
- [./docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 開發規範、命名規則
- [./docs/FEATURES.md](./docs/FEATURES.md) — 功能列表與完成狀態
- [./docs/TESTING.md](./docs/TESTING.md) — 測試規範與指南
- [./docs/CHANGELOG.md](./docs/CHANGELOG.md) — 更新日誌

## 回覆方式

- 儘量使用簡單易懂的中文問我問題或說明
- 如果是特殊名詞可以用英文
- 執行任務過程中可以使用英文