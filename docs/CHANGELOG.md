# CHANGELOG.md

紀錄專案的重要版本變更。格式參考 [Keep a Changelog](https://keepachangelog.com/)。

---

## [Unreleased]

### 修正

- **ECPay `MerchantTradeNo` 重複問題**：重試付款時，同一筆訂單會因為 `MerchantTradeNo` 相同而被綠界拒絕（錯誤 10300028）。現已在 `orderIdToTradeNo()` 加入 Unix 時間戳後綴（6 碼），每次呼叫 `/api/orders/:id/ecpay-form` 都產生不同的交易編號。
- **ECPay `TotalAmount` 型別問題**：綠界要求金額為整數，改以 `Math.round()` 確保傳入值不含小數點。
- **移除 `SimulatePaid` 參數**：此參數僅適用於綠界官方測試商店（MerchantID: `2000132`），使用自訂商店代號時會導致錯誤 10100050。已移除，測試時改用綠界提供的測試信用卡號手動操作。

---

## [1.0.0] — 2026-04-13

### 新增

- **使用者認證**：註冊（POST /api/auth/register）、登入（POST /api/auth/login）、個人資料（GET /api/auth/profile）
  - JWT HS256 認證，有效期 7 天
  - bcrypt 密碼雜湊（rounds=10，測試環境 rounds=1）

- **商品前台**：商品列表（GET /api/products，支援分頁）、商品詳情（GET /api/products/:id）

- **購物車**：支援訪客（X-Session-Id）與登入（Bearer JWT）雙模式
  - 新增至購物車（POST /api/cart，累加機制）
  - 修改數量（PATCH /api/cart/:itemId）
  - 移除項目（DELETE /api/cart/:itemId）
  - 查看購物車（GET /api/cart，含商品資訊 JOIN 與總金額計算）

- **訂單**：
  - 從購物車建立訂單（POST /api/orders，含 SQLite transaction：扣庫存 + 清購物車）
  - 我的訂單列表（GET /api/orders）
  - 訂單詳情（GET /api/orders/:id）
  - 模擬付款（PATCH /api/orders/:id/pay，支援 success/fail）

- **後台商品管理**（需 admin 角色）：
  - 商品列表（GET /api/admin/products，支援分頁）
  - 新增商品（POST /api/admin/products）
  - 編輯商品（PUT /api/admin/products/:id，部分更新）
  - 刪除商品（DELETE /api/admin/products/:id，pending 訂單保護）

- **後台訂單管理**（需 admin 角色）：
  - 訂單列表（GET /api/admin/orders，支援分頁與 status 過濾）
  - 訂單詳情（GET /api/admin/orders/:id，含使用者資訊）

- **EJS 前台頁面**：首頁、商品詳情、購物車、結帳、登入、我的訂單、訂單詳情

- **EJS 後台頁面**：商品管理、訂單管理

- **資料庫初始化**：
  - 自動建表（users, products, cart_items, orders, order_items）
  - 種子資料：1 個管理員帳號 + 8 款花卉商品
  - WAL mode + foreign keys 啟用

- **OpenAPI 文件**：swagger-jsdoc 整合，`npm run openapi` 產生 openapi.json

- **整合測試**：6 個測試檔，覆蓋所有主要 API 路由，使用 Vitest + supertest

---

*更新記錄以此格式持續維護。新版本請在上方插入。*
