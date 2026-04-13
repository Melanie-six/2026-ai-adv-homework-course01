# ARCHITECTURE.md

## 架構概述

本專案是單一 Express 伺服器同時提供 REST API 與 EJS 渲染頁面。資料庫使用 SQLite 單檔，啟動時自動初始化。

```
Client (Browser)
    │
    ├── GET /*, /admin/*     → EJS 渲染 HTML（pageRoutes）
    │       │
    │       └── 頁面載入 public/js/pages/*.js
    │               │
    │               └── 呼叫 /api/* endpoints
    │
    └── /api/*               → JSON REST API
```

## 目錄結構

```
.
├── app.js                    # Express 應用入口：middleware 掛載、路由組裝
├── server.js                 # HTTP 伺服器啟動，檢查 JWT_SECRET 是否設定
├── database.sqlite           # SQLite 資料庫檔案（自動生成）
├── swagger-config.js         # swagger-jsdoc 設定（OpenAPI 3.0 定義）
├── generate-openapi.js       # 執行後產生 openapi.json 規格檔
├── vitest.config.js          # 測試設定：指定執行順序，關閉平行化
├── .env                      # 環境變數（不進 git）
├── .env.example              # 環境變數範本
│
├── src/
│   ├── database.js           # 資料庫連線、建表（IF NOT EXISTS）、種子資料
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT 驗證，將 { userId, email, role } 注入 req.user
│   │   ├── adminMiddleware.js    # 角色檢查，req.user.role 必須為 'admin'
│   │   ├── sessionMiddleware.js  # 讀取 X-Session-Id header，注入 req.sessionId
│   │   └── errorHandler.js      # 全域錯誤處理，500 回傳安全訊息，避免洩漏細節
│   └── routes/
│       ├── authRoutes.js         # POST /register, POST /login, GET /profile
│       ├── productRoutes.js      # GET /products, GET /products/:id（無需認證）
│       ├── cartRoutes.js         # GET/POST /cart, PATCH/DELETE /cart/:id（雙模式認證）
│       ├── orderRoutes.js        # POST/GET /orders, GET /orders/:id, PATCH /orders/:id/pay
│       ├── adminProductRoutes.js # CRUD /admin/products（需 admin）
│       ├── adminOrderRoutes.js   # GET /admin/orders, GET /admin/orders/:id（需 admin）
│       └── pageRoutes.js         # 所有 EJS 頁面路由（前台 + 後台）
│
├── views/
│   ├── layouts/
│   │   ├── front.ejs             # 前台頁面 layout（header, footer, notification）
│   │   └── admin.ejs             # 後台頁面 layout（admin-header, admin-sidebar）
│   ├── pages/
│   │   ├── index.ejs             # 首頁
│   │   ├── product-detail.ejs    # 商品詳情
│   │   ├── cart.ejs              # 購物車
│   │   ├── checkout.ejs          # 結帳
│   │   ├── login.ejs             # 登入
│   │   ├── orders.ejs            # 我的訂單
│   │   ├── order-detail.ejs      # 訂單詳情（含付款結果顯示）
│   │   ├── 404.ejs               # 404 頁面
│   │   └── admin/
│   │       ├── products.ejs      # 後台商品管理
│   │       └── orders.ejs        # 後台訂單管理
│   └── partials/
│       ├── head.ejs              # <head> 標籤
│       ├── header.ejs            # 前台導覽列
│       ├── footer.ejs            # 頁腳
│       ├── notification.ejs      # 全域通知元件
│       ├── admin-header.ejs      # 後台頂部列
│       └── admin-sidebar.ejs     # 後台側欄
│
├── public/
│   ├── css/
│   │   ├── input.css             # Tailwind CSS 入口（@import tailwindcss）
│   │   └── output.css            # 編譯後的 CSS（由 tailwindcss CLI 生成）
│   ├── js/
│   │   ├── api.js                # apiFetch() 共用函式（自動附加 auth headers，處理 401）
│   │   ├── auth.js               # Auth 物件（token/session 管理，localStorage）
│   │   ├── header-init.js        # 頁面 header 初始化（登入狀態、購物車數）
│   │   ├── notification.js       # 通知系統（成功/錯誤訊息顯示）
│   │   └── pages/
│   │       ├── index.js          # 首頁邏輯
│   │       ├── product-detail.js # 商品詳情邏輯
│   │       ├── cart.js           # 購物車邏輯
│   │       ├── checkout.js       # 結帳邏輯
│   │       ├── login.js          # 登入邏輯
│   │       ├── orders.js         # 我的訂單邏輯
│   │       ├── order-detail.js   # 訂單詳情 + 付款邏輯
│   │       ├── admin-products.js # 後台商品管理邏輯
│   │       └── admin-orders.js   # 後台訂單管理邏輯
│   └── stylesheets/
│       └── style.css             # 自訂 CSS（非 Tailwind 的補充樣式）
│
└── tests/
    ├── setup.js                  # 測試輔助：getAdminToken(), registerUser()
    ├── auth.test.js
    ├── products.test.js
    ├── cart.test.js
    ├── orders.test.js
    ├── adminProducts.test.js
    └── adminOrders.test.js
```

## 啟動流程

```
npm start
  │
  ├── css:build（Tailwind CLI → public/css/output.css）
  │
  └── node server.js
        │
        ├── 檢查 JWT_SECRET 是否設定（未設定則 process.exit(1)）
        │
        └── require('./app')
              │
              ├── require('./src/database')
              │     ├── db.pragma('journal_mode = WAL')
              │     ├── db.pragma('foreign_keys = ON')
              │     ├── CREATE TABLE IF NOT EXISTS（users, products, cart_items, orders, order_items）
              │     ├── seedAdminUser()（若 admin email 不存在則插入）
              │     └── seedProducts()（若 products 表為空則插入 8 筆）
              │
              ├── 掛載 global middleware
              │     ├── cors（origin: FRONTEND_URL）
              │     ├── express.json()
              │     ├── express.urlencoded()
              │     └── sessionMiddleware（讀取 X-Session-Id header）
              │
              ├── 掛載 API 路由
              │     ├── /api/auth → authRoutes
              │     ├── /api/admin/products → adminProductRoutes
              │     ├── /api/admin/orders → adminOrderRoutes
              │     ├── /api/products → productRoutes
              │     ├── /api/cart → cartRoutes
              │     └── /api/orders → orderRoutes
              │
              ├── 掛載 Page 路由
              │     └── / → pageRoutes（EJS 渲染）
              │
              ├── 404 handler（/api/* 回 JSON，其他回 EJS 404 頁面）
              └── errorHandler（全域錯誤）
```

## API 路由總覽

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| POST | /api/auth/register | 無 | 註冊新帳號 |
| POST | /api/auth/login | 無 | 登入 |
| GET | /api/auth/profile | JWT | 取得個人資料 |
| GET | /api/products | 無 | 商品列表（支援分頁） |
| GET | /api/products/:id | 無 | 商品詳情 |
| GET | /api/cart | JWT 或 Session | 查看購物車 |
| POST | /api/cart | JWT 或 Session | 加入購物車 |
| PATCH | /api/cart/:itemId | JWT 或 Session | 修改購物車數量 |
| DELETE | /api/cart/:itemId | JWT 或 Session | 移除購物車項目 |
| POST | /api/orders | JWT | 從購物車建立訂單 |
| GET | /api/orders | JWT | 我的訂單列表 |
| GET | /api/orders/:id | JWT | 訂單詳情（僅限本人） |
| PATCH | /api/orders/:id/pay | JWT | 模擬付款（success/fail） |
| GET | /api/admin/products | JWT + admin | 後台商品列表 |
| POST | /api/admin/products | JWT + admin | 新增商品 |
| PUT | /api/admin/products/:id | JWT + admin | 編輯商品 |
| DELETE | /api/admin/products/:id | JWT + admin | 刪除商品 |
| GET | /api/admin/orders | JWT + admin | 後台所有訂單列表 |
| GET | /api/admin/orders/:id | JWT + admin | 後台訂單詳情 |

## 統一回應格式

所有 API 皆回傳以下結構：

```json
// 成功
{
  "data": { ... },
  "error": null,
  "message": "成功"
}

// 失敗
{
  "data": null,
  "error": "ERROR_CODE",
  "message": "錯誤說明"
}
```

常見 error code：

| error | HTTP Status | 意義 |
|-------|-------------|------|
| `VALIDATION_ERROR` | 400 | 欄位缺失或格式錯誤 |
| `UNAUTHORIZED` | 401 | 未登入或 token 無效 |
| `FORBIDDEN` | 403 | 角色權限不足（非 admin） |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | 衝突（如 email 重複、商品有未完成訂單） |
| `CART_EMPTY` | 400 | 建立訂單時購物車為空 |
| `STOCK_INSUFFICIENT` | 400 | 庫存不足 |
| `INVALID_STATUS` | 400 | 訂單狀態不允許此操作 |
| `INTERNAL_ERROR` | 500 | 伺服器內部錯誤 |

## 認證與授權機制

### JWT 認證（authMiddleware）

1. 讀取 `Authorization: Bearer <token>` header
2. 若 header 不存在或格式錯誤 → 401
3. `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })`
4. 驗證 userId 是否存在於 users 表（防止已刪除帳號的舊 token）
5. 成功後將 `{ userId, email, role }` 注入 `req.user`

**JWT 參數**：
- 演算法：HS256
- 有效期：7 天（`expiresIn: '7d'`）
- Payload：`{ userId, email, role }`
- Secret：`process.env.JWT_SECRET`

### 管理員授權（adminMiddleware）

必須先經過 `authMiddleware`，再確認 `req.user.role === 'admin'`，否則回 403。

### 購物車雙模式認證（dualAuth，位於 cartRoutes.js）

**重要**：這是專為購物車設計的特殊認證邏輯，非全域 middleware。

```
request 進入 dualAuth
    │
    ├── 有 Authorization: Bearer header？
    │   ├── 是 → 驗證 JWT
    │   │       ├── 成功 → req.user = decoded，繼續
    │   │       └── 失敗 → 直接 401（不 fallback）
    │   └── 否 ↓
    │
    ├── 有 req.sessionId（X-Session-Id header）？
    │   ├── 是 → 繼續（guest 模式）
    │   └── 否 → 401
    │
購物車操作識別使用者：
    - req.user 存在 → WHERE user_id = req.user.userId
    - req.sessionId 存在 → WHERE session_id = req.sessionId
```

**重要行為**：前端 `auth.js` 的 `getAuthHeaders()` 同時送出 `Authorization` 和 `X-Session-Id`。當使用者已登入，購物車會與 `user_id` 關聯；未登入則與 `session_id` 關聯。兩種模式的資料**不會自動合併**。

### Session Middleware（全域）

`sessionMiddleware` 是全域掛載的輕量 middleware，讀取 `X-Session-Id` request header，若存在則注入 `req.sessionId`。本身不做任何驗證，只是傳遞值。

## 資料庫 Schema

資料庫位於 `database.sqlite`（相對於 `src/database.js` 的上層目錄，即根目錄）。

啟用設定：
- `PRAGMA journal_mode = WAL`（Write-Ahead Logging，提升並發讀取效能）
- `PRAGMA foreign_keys = ON`（強制外鍵約束）

### users

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| email | TEXT | UNIQUE, NOT NULL | 登入帳號 |
| password_hash | TEXT | NOT NULL | bcrypt hash |
| name | TEXT | NOT NULL | 顯示名稱 |
| role | TEXT | NOT NULL, DEFAULT 'user', CHECK IN ('user','admin') | 角色 |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | ISO 8601 字串 |

### products

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| name | TEXT | NOT NULL | 商品名稱 |
| description | TEXT | - | 商品描述（可為 NULL） |
| price | INTEGER | NOT NULL, CHECK > 0 | 售價（整數，台幣） |
| stock | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 | 庫存數量 |
| image_url | TEXT | - | 商品圖片 URL（可為 NULL） |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間 |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | 更新時間（PUT 時手動更新） |

### cart_items

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| session_id | TEXT | - | 訪客 session（可為 NULL） |
| user_id | TEXT | FK → users(id) | 已登入使用者（可為 NULL） |
| product_id | TEXT | NOT NULL, FK → products(id) | 商品 |
| quantity | INTEGER | NOT NULL, DEFAULT 1, CHECK > 0 | 數量 |

注意：`session_id` 和 `user_id` 恰有一個有值，另一個為 NULL。

### orders

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| order_no | TEXT | UNIQUE, NOT NULL | 格式：`ORD-YYYYMMDD-XXXXX` |
| user_id | TEXT | NOT NULL, FK → users(id) | 訂購人 |
| recipient_name | TEXT | NOT NULL | 收件人姓名 |
| recipient_email | TEXT | NOT NULL | 收件人 Email |
| recipient_address | TEXT | NOT NULL | 收件地址 |
| total_amount | INTEGER | NOT NULL | 訂單總金額 |
| status | TEXT | NOT NULL, DEFAULT 'pending', CHECK IN ('pending','paid','failed') | 付款狀態 |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間 |

### order_items

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| order_id | TEXT | NOT NULL, FK → orders(id) | 所屬訂單 |
| product_id | TEXT | NOT NULL, FK → products(id) | 商品（快照，商品刪除後仍保留資料） |
| product_name | TEXT | NOT NULL | 下單時的商品名稱（快照） |
| product_price | INTEGER | NOT NULL | 下單時的商品單價（快照） |
| quantity | INTEGER | NOT NULL | 購買數量 |

**設計說明**：`product_name` 和 `product_price` 以快照方式儲存，即使商品事後被修改或刪除，訂單明細仍保留原始金額與名稱。

## 前端模組說明

前端使用原生 JS，不使用任何前端框架。各 JS 模組的載入順序由 EJS layout 決定。

### auth.js — Auth 物件

全域物件，管理 JWT token 與 session ID 的 localStorage 儲存：

- `TOKEN_KEY = 'flower_token'` — localStorage key
- `USER_KEY = 'flower_user'` — localStorage key（JSON 字串）
- `SESSION_KEY = 'flower_session_id'` — localStorage key
- `getSessionId()` — 自動生成並持久化 UUID（`crypto.randomUUID()`）
- `getAuthHeaders()` — 同時回傳 `Authorization` 和 `X-Session-Id`，**兩者同時送出**

### api.js — apiFetch 函式

包裝 `fetch()`，自動附加 auth headers，並處理 401 自動登出（清除 localStorage 並跳轉 `/login`）。
