# DEVELOPMENT.md

## 環境設定

### 環境變數

複製 `.env.example` 為 `.env` 後填入實際值。

| 變數 | 用途 | 必要性 | 預設值 |
|------|------|--------|--------|
| `JWT_SECRET` | JWT 簽發與驗證的密鑰（HS256） | **必要**（未設定則啟動時 exit） | 無 |
| `PORT` | 伺服器監聽 port | 選填 | `3001` |
| `BASE_URL` | 伺服器 base URL（目前未在路由邏輯中使用） | 選填 | `http://localhost:3001` |
| `FRONTEND_URL` | CORS 允許的前端來源 | 選填 | `http://localhost:5173` |
| `ADMIN_EMAIL` | 種子管理員帳號 Email | 選填 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | 種子管理員帳號密碼 | 選填 | `12345678` |
| `ECPAY_MERCHANT_ID` | 綠界商店代號（保留欄位） | 選填 | `3002607` |
| `ECPAY_HASH_KEY` | 綠界 Hash Key（保留欄位） | 選填 | — |
| `ECPAY_HASH_IV` | 綠界 Hash IV（保留欄位） | 選填 | — |
| `ECPAY_ENV` | 綠界環境（staging/production）（保留欄位） | 選填 | `staging` |

> ECPay 相關變數目前在程式碼中未被引用，保留供未來串接使用。

### NODE_ENV 的影響

`NODE_ENV=test` 時，`src/database.js` 的 `seedAdminUser()` 使用 `bcrypt` salt rounds = 1（測試模式加速），正式環境為 10。

## 命名規則

### 後端（Node.js）

| 對象 | 規則 | 範例 |
|------|------|------|
| 檔案名稱 | camelCase | `authRoutes.js`, `adminMiddleware.js` |
| 變數/函式 | camelCase | `getOwnerCondition`, `cartItems` |
| 常數（物件 key） | camelCase | `JWT_SECRET` 為 env var，程式內使用 `jwtSecret` |
| 資料庫欄位 | snake_case | `user_id`, `order_no`, `created_at` |
| API request body | camelCase | `productId`, `recipientName`, `recipientEmail` |
| API response body | snake_case（直接對應 DB 欄位） | `product_id`, `order_no`, `total_amount` |
| Error code 字串 | SCREAMING_SNAKE_CASE | `VALIDATION_ERROR`, `STOCK_INSUFFICIENT` |
| Router 變數 | `router`（固定） | `const router = express.Router()` |

### 前端（public/js）

| 對象 | 規則 | 範例 |
|------|------|------|
| 頁面 JS 檔案 | kebab-case | `admin-products.js`, `order-detail.js` |
| 函式/變數 | camelCase | `loadProducts`, `renderCartItem` |
| localStorage key | 全域 prefix `flower_` | `flower_token`, `flower_user` |

### EJS 模板

| 對象 | 規則 |
|------|------|
| Layout 檔 | 放在 `views/layouts/`，`front.ejs` 或 `admin.ejs` |
| 頁面檔 | 放在 `views/pages/`，後台放在 `views/pages/admin/` |
| Partial 檔 | 放在 `views/partials/` |

## 模組系統說明

本專案使用 **CommonJS**（`require` / `module.exports`），除了 `vitest.config.js` 使用 ESM（`import` / `export default`）。

- 所有 `src/`、`tests/`、根目錄的 `.js` 檔案使用 CommonJS
- `vitest.config.js` 使用 ESM（Vitest 要求）

## 新增 API 路由的步驟

1. 在 `src/routes/` 建立或編輯對應的 route 檔案
2. 在路由 handler 上方加入 `@openapi` JSDoc 註解（供 swagger-jsdoc 解析）
3. 若需要認證，在 `router.use()` 掛載 `authMiddleware`（或在個別路由上掛載）
4. 若需要管理員權限，在 `authMiddleware` 之後掛載 `adminMiddleware`
5. 在 `app.js` 的 API Routes 區段加入 `app.use('/api/your-prefix', require('./src/routes/yourRoutes'))`
6. 執行 `npm run openapi` 更新 `openapi.json`

```javascript
// 範例：新增一個需要 JWT 認證的路由
const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/your-endpoint:
 *   get:
 *     summary: 你的端點說明
 *     tags: [YourTag]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 */
router.get('/', (req, res) => {
  res.json({ data: {}, error: null, message: '成功' });
});

module.exports = router;
```

## 新增 Middleware 的步驟

1. 在 `src/middleware/` 建立新檔案
2. Export 一個 `function(req, res, next)` 形式的 middleware 函式
3. 在 `app.js` 的適當位置使用 `app.use()` 或在特定路由中掛載

全域 middleware 掛載順序（`app.js`）：
1. `cors`
2. `express.json()`
3. `express.urlencoded()`
4. `sessionMiddleware`（讀取 X-Session-Id）
5. API 路由（各自帶有 authMiddleware / adminMiddleware）
6. Page 路由
7. 404 handler
8. `errorHandler`（必須最後）

## 新增資料庫表的步驟

1. 在 `src/database.js` 的 `initializeDatabase()` 函式中，在 `db.exec()` 的 SQL 字串內加入 `CREATE TABLE IF NOT EXISTS`
2. 若需要種子資料，建立對應的 seed 函式（參考 `seedProducts()` 的寫法）
3. 在 `initializeDatabase()` 末尾呼叫新的 seed 函式

> 注意：`CREATE TABLE IF NOT EXISTS` 保證冪等性（每次啟動都安全執行），但若要修改已存在的表結構，需手動執行 `ALTER TABLE` 或刪除 `database.sqlite` 重建。

## JSDoc 格式說明

所有 API 路由使用 `@openapi` tag（非 `@swagger`）撰寫 OpenAPI 3.0 規格，由 `swagger-jsdoc` 解析：

```javascript
/**
 * @openapi
 * /api/path:
 *   method:
 *     summary: 簡短說明
 *     tags: [TagName]
 *     security:
 *       - bearerAuth: []        # JWT 認證
 *       - sessionId: []         # Session 認證（購物車用）
 *     parameters:
 *       - in: query             # 或 path、header
 *         name: paramName
 *         schema:
 *           type: integer
 *           default: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [field1]
 *             properties:
 *               field1:
 *                 type: string
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 */
```

Security schemes 定義在 `swagger-config.js`：
- `bearerAuth`：HTTP Bearer JWT
- `sessionId`：API Key，位於 `X-Session-Id` header

## 計畫歸檔流程

1. **計畫檔案命名格式**：`YYYY-MM-DD-<feature-name>.md`（例：`2026-04-13-order-payment.md`）
2. **計畫文件結構**：
   ```markdown
   # 功能名稱

   ## User Story
   作為 <角色>，我希望 <功能>，以便 <目的>。

   ## Spec
   - 詳細規格說明...

   ## Tasks
   - [ ] Task 1
   - [ ] Task 2
   - [x] 已完成的 Task
   ```
3. **進行中**：計畫檔放在 `docs/plans/`
4. **功能完成後**：
   - 將計畫檔移至 `docs/plans/archive/`
   - 更新 `docs/FEATURES.md` 中對應功能的完成狀態
   - 在 `docs/CHANGELOG.md` 新增版本紀錄
