# FEATURES.md

## 功能完成狀態

| 功能模組 | 狀態 | 路由檔案 |
|----------|------|----------|
| 使用者認證（註冊/登入/個人資料） | 完成 | `src/routes/authRoutes.js` |
| 商品列表與詳情（前台） | 完成 | `src/routes/productRoutes.js` |
| 購物車（訪客 + 登入雙模式） | 完成 | `src/routes/cartRoutes.js` |
| 訂單建立與查詢 | 完成 | `src/routes/orderRoutes.js` |
| 模擬付款 | 完成 | `src/routes/orderRoutes.js` |
| ECPay 綠界金流 | 完成 | `src/routes/orderRoutes.js`, `src/routes/ecpayRoutes.js`, `src/ecpay.js` |
| 後台商品 CRUD | 完成 | `src/routes/adminProductRoutes.js` |
| 後台訂單列表與詳情 | 完成 | `src/routes/adminOrderRoutes.js` |
| EJS 前台頁面 | 完成 | `src/routes/pageRoutes.js` |
| EJS 後台頁面 | 完成 | `src/routes/pageRoutes.js` |
| OpenAPI 文件產生 | 完成 | `swagger-config.js`, `generate-openapi.js` |

---

## 功能行為詳細說明

### 1. 使用者認證

#### POST /api/auth/register — 註冊

**必填欄位**：`email`（string，Email 格式）、`password`（string，最少 6 字元）、`name`（string）

**業務邏輯**：
1. 驗證 email 格式（regex）
2. 驗證密碼長度 >= 6
3. 查詢 email 是否已被使用
4. `bcrypt.hashSync(password, 10)` 生成 hash
5. INSERT 至 users 表（role 固定為 `'user'`，id 為 UUID v4）
6. 立即產生 JWT token（`expiresIn: '7d'`）並回傳

**成功回傳（201）**：
```json
{
  "data": {
    "user": { "id": "...", "email": "...", "name": "...", "role": "user" },
    "token": "eyJ..."
  },
  "error": null,
  "message": "註冊成功"
}
```

**錯誤情境**：
- `400 VALIDATION_ERROR`：email/password/name 缺失、email 格式錯誤、密碼少於 6 字元
- `409 CONFLICT`：email 已被註冊

---

#### POST /api/auth/login — 登入

**必填欄位**：`email`、`password`

**業務邏輯**：
1. 驗證欄位存在
2. 以 email 查詢 user（`SELECT * FROM users WHERE email = ?`）
3. `bcrypt.compareSync()` 驗證密碼
4. 產生 JWT token 回傳

**重要**：Email 不存在與密碼錯誤皆回傳相同訊息（「Email 或密碼錯誤」），避免帳號枚舉攻擊。

**錯誤情境**：
- `400 VALIDATION_ERROR`：欄位缺失
- `401 UNAUTHORIZED`：Email 或密碼錯誤

---

#### GET /api/auth/profile — 取得個人資料

**認證**：JWT（Bearer token）

回傳 `{ id, email, name, role, created_at }`，不回傳 `password_hash`。

**錯誤情境**：
- `401 UNAUTHORIZED`：token 缺失、無效或過期

---

### 2. 商品（前台）

#### GET /api/products — 商品列表

**查詢參數**：
- `page`（integer，預設 1，最小 1）
- `limit`（integer，預設 10，最小 1，最大 100）

**業務邏輯**：
1. 計算 offset = (page - 1) * limit
2. `SELECT * FROM products ORDER BY created_at DESC LIMIT ? OFFSET ?`
3. 計算 totalPages = Math.ceil(total / limit)

**回傳格式**：
```json
{
  "data": {
    "products": [...],
    "pagination": {
      "total": 8,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
}
```

**認證**：不需要。任何人皆可瀏覽。

---

#### GET /api/products/:id — 商品詳情

**回傳**：完整商品物件（id, name, description, price, stock, image_url, created_at, updated_at）

**錯誤情境**：
- `404 NOT_FOUND`：商品不存在

---

### 3. 購物車（雙模式認證）

購物車是本專案最複雜的功能，支援**訪客（session）** 與**登入（JWT）** 兩種模式。

#### 雙模式認證行為（dualAuth）

關鍵規則：
- 帶有 `Authorization: Bearer <valid_token>` → 以 `user_id` 識別購物車
- 帶有 `Authorization: Bearer <invalid_token>` → **直接 401**，不 fallback
- 僅帶有 `X-Session-Id: <uuid>` → 以 `session_id` 識別購物車
- 兩者都沒有 → 401

前端 `auth.js` 的 `getAuthHeaders()` **永遠同時送出兩個 header**。伺服器以 Authorization header 為優先，有 token 時不使用 sessionId。

---

#### POST /api/cart — 加入商品

**必填欄位**：`productId`（string）、`quantity`（integer，預設 1，最小 1）

**業務邏輯（累加機制）**：
1. 驗證 productId 對應商品存在
2. 查詢該 owner（user_id 或 session_id）是否已有此商品在購物車
3. **若已存在**：newQty = existingQty + qty，檢查 newQty 是否 <= stock，然後 UPDATE
4. **若不存在**：檢查 qty 是否 <= stock，然後 INSERT

這是「累加」而非「取代」邏輯。重複加入同一商品會累積數量。

**錯誤情境**：
- `400 VALIDATION_ERROR`：productId 缺失、quantity 非正整數
- `404 NOT_FOUND`：商品不存在
- `400 STOCK_INSUFFICIENT`：加入數量超過庫存（含已在購物車的數量）

---

#### PATCH /api/cart/:itemId — 修改數量

**業務邏輯**：
1. 以 itemId + owner 條件查詢購物車項目（防止跨使用者修改）
2. 確認新數量 <= 商品庫存
3. UPDATE quantity（**直接取代**，非累加）

---

#### DELETE /api/cart/:itemId — 移除項目

1. 以 itemId + owner 條件查詢（所有權驗證）
2. DELETE

---

#### GET /api/cart — 查看購物車

回傳所有購物車項目，每個項目 JOIN 商品資料：
```json
{
  "data": {
    "items": [
      {
        "id": "cart-item-uuid",
        "product_id": "...",
        "quantity": 2,
        "product": {
          "name": "粉色玫瑰花束",
          "price": 1680,
          "stock": 30,
          "image_url": "https://..."
        }
      }
    ],
    "total": 3360
  }
}
```

`total` 在伺服器端計算：`Σ(price × quantity)`

---

### 4. 訂單

#### POST /api/orders — 建立訂單

**認證**：JWT 必要（只有登入使用者才能建立訂單）

**必填欄位**：`recipientName`、`recipientEmail`（Email 格式）、`recipientAddress`

**業務邏輯（SQLite Transaction）**：
1. 取得使用者的購物車（`WHERE user_id = ?`，**不支援 session 模式**）
2. 若購物車為空 → `400 CART_EMPTY`
3. 批次確認所有商品庫存是否足夠
4. 計算 totalAmount
5. **在單一 transaction 中原子執行**：
   - INSERT orders（id, order_no, user_id, recipient info, totalAmount, status='pending'）
   - INSERT order_items（每個購物車項目建立一筆，含商品名稱/價格快照）
   - UPDATE products SET stock = stock - quantity（每個商品扣庫存）
   - DELETE cart_items WHERE user_id = ?（清空購物車）

**Order No 格式**：`ORD-YYYYMMDD-XXXXX`
- YYYYMMDD：當前 UTC 日期
- XXXXX：UUID v4 前 5 碼大寫（例：`ORD-20260413-A3F2E`）

**回傳（201）**：訂單基本資訊 + items 陣列（商品名/價/量），**不含** recipient_address（結帳時已知）

**錯誤情境**：
- `400 CART_EMPTY`：購物車為空
- `400 STOCK_INSUFFICIENT`：列出庫存不足的商品名稱
- `400 VALIDATION_ERROR`：欄位缺失或 email 格式錯誤
- `401 UNAUTHORIZED`：未登入

---

#### GET /api/orders — 我的訂單列表

回傳當前登入使用者的所有訂單（`WHERE user_id = ?`），按 `created_at DESC` 排序。

**不包含** items 明細（清單頁），僅包含：id, order_no, total_amount, status, created_at。

---

#### GET /api/orders/:id — 訂單詳情

包含完整訂單資訊 + items 陣列（含 product_id, product_name, product_price, quantity）。

**資料隔離**：`WHERE id = ? AND user_id = ?`，確保使用者只能看到自己的訂單。

---

#### PATCH /api/orders/:id/pay — 模擬付款

**必填欄位**：`action`（string，必須為 `"success"` 或 `"fail"`）

**業務邏輯**：
1. 確認訂單屬於當前使用者
2. 確認訂單 status 為 `'pending'`（非 pending 訂單不可再付款）
3. `"success"` → status 改為 `'paid'`
4. `"fail"` → status 改為 `'failed'`

**狀態流轉**：`pending` → `paid` 或 `failed`（終態，無法再改變）

**錯誤情境**：
- `400 VALIDATION_ERROR`：action 無效
- `400 INVALID_STATUS`：訂單已不是 pending
- `404 NOT_FOUND`：訂單不存在或不屬於本人

---

#### GET /api/orders/:id/ecpay-form — 取得綠界付款參數

**認證**：JWT 必要

**業務邏輯**：
1. 驗證訂單屬於當前使用者且 status 為 `'pending'`
2. 查詢訂單明細（order_items）
3. 呼叫 `buildAioParams(order, items)` 組裝綠界 AIO 所有必要參數，包含：
   - `MerchantTradeNo`：UUID 前 14 碼 + Unix 時間戳後 6 碼（每次呼叫皆產生唯一值，避免綠界重複訂單號錯誤）
   - `TotalAmount`：`Math.round(order.total_amount)`（綠界要求整數）
   - `CheckMacValue`：SHA256 + PHP urlencode 規格計算
4. 將本次 `MerchantTradeNo` 存回 `orders.merchant_trade_no`（供 `/ecpay/notify` 反查訂單用）
5. 回傳 `{ actionUrl, params }`，前端收到後自行組成 hidden form 並 submit

**回傳**：
```json
{
  "data": {
    "actionUrl": "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
    "params": {
      "MerchantID": "...",
      "MerchantTradeNo": "...",
      "CheckMacValue": "...",
      ...
    }
  },
  "error": null,
  "message": "成功"
}
```

**錯誤情境**：
- `400 ORDER_NOT_PENDING`：訂單已付款或已失敗
- `404 NOT_FOUND`：訂單不存在或不屬於本人

---

#### POST /api/orders/:id/check-payment — 主動查詢付款結果

**認證**：JWT 必要

**業務邏輯**：
1. 驗證訂單屬於當前使用者
2. 若訂單已非 `'pending'`，直接回傳目前狀態（避免重複查詢）
3. 呼叫綠界 `QueryTradeInfo V5` API，傳入 `merchant_trade_no`
4. `TradeStatus === '1'` → 更新 status 為 `'paid'`；否則維持現狀

---

### 5. 後台商品管理（Admin Products）

所有後台路由皆需 `authMiddleware + adminMiddleware`（JWT + role='admin'）。

#### GET /api/admin/products — 後台商品列表

與前台 `GET /api/products` 邏輯相同（支援 page/limit 分頁），但需要管理員認證。

#### POST /api/admin/products — 新增商品

**必填欄位**：`name`（string）、`price`（正整數）、`stock`（非負整數）

**選填欄位**：`description`（string）、`image_url`（string）

**驗證規則**：
- `name` 不可為空字串
- `price` 必須為正整數（> 0）
- `stock` 必須為非負整數（>= 0）

#### PUT /api/admin/products/:id — 編輯商品

支援部分更新（Partial Update）：只更新有提供的欄位，其餘保留原值。

`updated_at` 在執行 UPDATE 時手動設為 `datetime('now')`。

**驗證規則**（僅驗證有提供的欄位）：
- `name` 不可為空字串（trim 後）
- `price` 若提供，必須為正整數
- `stock` 若提供，必須為非負整數

#### DELETE /api/admin/products/:id — 刪除商品

**防護機制**：若商品存在於任何 `status='pending'` 的訂單中，拒絕刪除，回傳 `409 CONFLICT`。

已完成（paid/failed）的訂單不影響刪除，因為訂單明細已快照商品資料。

---

### 6. 後台訂單管理（Admin Orders）

#### GET /api/admin/orders — 後台訂單列表

**查詢參數**：
- `page`（integer，預設 1）
- `limit`（integer，預設 10，最大 100）
- `status`（string，選填，值必須為 `pending`、`paid`、`failed` 之一）

status 過濾：若提供有效 status，加上 `WHERE status = ?` 條件；若提供無效值，忽略過濾條件（視為不過濾）。

回傳所有使用者的訂單（不限 user_id），與使用者端 `GET /api/orders` 的差異在於此。

#### GET /api/admin/orders/:id — 後台訂單詳情

回傳訂單完整資訊 + items + 訂購使用者資訊（name, email）：

```json
{
  "data": {
    "id": "...",
    "order_no": "ORD-20260413-A3F2E",
    ...
    "items": [...],
    "user": {
      "name": "測試使用者",
      "email": "user@example.com"
    }
  }
}
```

若使用者已被刪除，`user` 欄位為 `null`。

---

### 7. EJS 頁面路由

頁面路由（`src/routes/pageRoutes.js`）只負責渲染 EJS 模板，不做業務邏輯。所有業務邏輯由前端 JS 透過 API 呼叫處理。

**兩種 Layout**：

- `front.ejs`：一般前台頁面，包含 header、footer、notification
- `admin.ejs`：後台頁面，包含 admin-header、admin-sidebar

渲染方式使用雙層 render（先渲染 page body，再注入 layout）：

```javascript
function renderFront(res, page, locals = {}) {
  res.render('pages/' + page, { layout: 'front', ...locals }, function (err, body) {
    res.render('layouts/front', { body, ...locals });
  });
}
```

`pageScript` local 變數指定該頁面要載入哪個 `public/js/pages/*.js`（由 layout EJS 決定 script 標籤）。

訂單詳情頁面接受 `?payment=success` 或 `?payment=fail` 查詢參數（`paymentResult` local），顯示付款結果通知。

---

### 8. ECPay 綠界金流

#### 付款流程概述

```
前端呼叫 GET /api/orders/:id/ecpay-form
    │
    └── 取得 actionUrl + params（含 CheckMacValue）
            │
            └── 前端組成 hidden form，POST 至綠界
                    │
                    ├── 使用者完成付款
                    │       │
                    │       ├── 綠界 POST /ecpay/notify（ReturnURL）
                    │       │       └── 驗證 CheckMacValue → 更新 status='paid'
                    │       │
                    │       └── 使用者點「返回商店」→ GET /ecpay/return（ClientBackURL）
                    │               └── 呼叫 QueryTradeInfo → 更新狀態 → redirect 訂單詳情頁
                    │
                    └── 使用者離開但未確認 → 前端輪詢 POST /api/orders/:id/check-payment
```

#### src/ecpay.js — 核心工具模組

- **`generateCheckMacValue(params)`**：依照綠界 SHA256 規格計算 CheckMacValue。流程：排序參數 → 拼接字串 → PHP urlencode → `~` 替換 → 轉小寫 → .NET 特殊字元還原 → SHA256 hex 大寫。
- **`verifyCheckMacValue(params)`**：使用 `crypto.timingSafeEqual` 驗證綠界回傳的 CheckMacValue，防止 timing attack。
- **`buildAioParams(order, items)`**：組裝送往綠界的完整表單參數，`MerchantTradeNo` 含時間戳後綴以確保每次唯一，`TotalAmount` 以 `Math.round()` 確保整數。
- **`queryTradeInfo(merchantTradeNo)`**：以 HTTP POST 主動呼叫綠界 `QueryTradeInfo V5`，回傳解析後的物件（含 `TradeStatus`）。
- **`orderIdToTradeNo(orderId, suffix)`**：將 UUID 轉換為最多 20 碼的英數字，suffix 為時間戳後綴。

#### GET /ecpay/return — ClientBackURL

使用者在綠界付款頁面點「返回商店」後觸發（GET 請求，帶 `?orderId=<uuid>`）。

**業務邏輯**：
1. 若訂單已是 `'paid'` → redirect `/orders/:id?payment=success`
2. 若訂單不是 `'pending'` → redirect `/orders/:id?payment=failed`
3. 呼叫 `QueryTradeInfo` 確認付款結果：
   - `TradeStatus === '1'` → 更新為 `'paid'`，redirect `?payment=success`
   - 其他 → redirect `?payment=pending`（使用者可能取消或尚未完成）

#### POST /ecpay/notify — ReturnURL

綠界伺服器主動 POST 付款通知（非使用者觸發）。

**業務邏輯**：
1. 驗證 `CheckMacValue`（`verifyCheckMacValue`），驗證失敗仍回傳 `1|OK`（避免重試風暴）
2. `RtnCode === '1'` → 以 `MerchantTradeNo` 查詢訂單，status 為 `'pending'` 時更新為 `'paid'`
3. **必須回傳純文字 `1|OK`（HTTP 200）**，否則綠界會持續重試

#### 環境設定

| 環境變數 | 說明 |
|----------|------|
| `ECPAY_MERCHANT_ID` | 綠界商店代號 |
| `ECPAY_HASH_KEY` | CheckMacValue 計算用 Hash Key |
| `ECPAY_HASH_IV` | CheckMacValue 計算用 Hash IV |
| `ECPAY_ENV` | `staging`（測試）或 `production`（正式），決定 API URL |
| `BASE_URL` | 伺服器對外 URL，用於組裝 ReturnURL 和 ClientBackURL |

**測試環境注意事項**：
- 使用商店代號 `3002607` 時，不支援 `SimulatePaid` 參數（僅 `2000132` 支援）
- 測試信用卡：`4311-9522-2222-2222`，CVV：`222`，有效年月：任何未過期日期
- 本地開發時 `ReturnURL`（`/ecpay/notify`）無法被綠界呼叫，付款確認依賴 `/ecpay/return` 或 `/api/orders/:id/check-payment`
