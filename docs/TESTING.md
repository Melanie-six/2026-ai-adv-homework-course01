# TESTING.md

## 測試概述

本專案使用 **Vitest** + **supertest** 進行 HTTP 整合測試，直接對 Express app 發送 HTTP request，不使用任何 mock。測試共用同一個真實的 SQLite 資料庫（`database.sqlite`）。

## 測試檔案總覽

| 檔案 | 說明 | 執行順序 |
|------|------|---------|
| `tests/setup.js` | 共用輔助函式（非測試檔） | — |
| `tests/auth.test.js` | 認證 API 測試（register, login, profile） | 1 |
| `tests/products.test.js` | 商品 API 測試（list, detail, pagination） | 2 |
| `tests/cart.test.js` | 購物車 API 測試（guest 模式、JWT 模式） | 3 |
| `tests/orders.test.js` | 訂單 API 測試（建立、列表、詳情） | 4 |
| `tests/adminProducts.test.js` | 後台商品 CRUD 測試 | 5 |
| `tests/adminOrders.test.js` | 後台訂單測試（列表、過濾、詳情） | 6 |

## 執行方式

```bash
# 執行所有測試
npm test

# 執行特定測試檔（直接用 vitest）
npx vitest run tests/auth.test.js
```

## 測試設定（vitest.config.js）

```javascript
{
  test: {
    globals: true,           // 可使用 describe/it/expect 等全域函式
    fileParallelism: false,  // 檔案間序列執行（共用資料庫，需避免競爭）
    sequence: {
      files: [...]           // 指定固定的執行順序
    },
    hookTimeout: 10000       // beforeAll 逾時 10 秒（bcrypt 可能較慢）
  }
}
```

**關鍵設定**：`fileParallelism: false` 確保所有測試檔按序執行，避免多個測試同時修改 SQLite 導致競爭條件。

## 執行順序與依賴關係

測試檔之間的依賴如下：

```
auth.test.js
    │ 建立測試使用者，驗證認證流程
    ▼
products.test.js
    │ 讀取種子商品資料（需資料庫已初始化）
    ▼
cart.test.js
    │ 依賴 products（取第一個商品的 id）
    │ 同時測試 guest 模式和 JWT 模式
    ▼
orders.test.js
    │ 依賴 products（取商品 id）
    │ 先加入購物車再建立訂單（訂單建立後購物車清空）
    ▼
adminProducts.test.js
    │ 依賴 admin 帳號存在（種子資料）
    │ 測試新增後再刪除（自我清理）
    ▼
adminOrders.test.js
    │ 在 beforeAll 中建立訂單（確保有資料可查）
    │ 依賴 admin 帳號 + products
```

**重要**：`orders.test.js` 的 `should create an order from cart` 在 `beforeAll` 加入購物車，建立訂單後購物車會被清空。下一個測試 `should fail to create order with empty cart` 依賴這個清空行為，**不可調換順序**。

## 輔助函式說明（tests/setup.js）

### getAdminToken()

```javascript
async function getAdminToken()
// 回傳：string（JWT token）
```

登入種子管理員帳號（`admin@hexschool.com` / `12345678`），回傳 JWT token。

在 `beforeAll` 中呼叫，供需要管理員身份的測試使用。

### registerUser(overrides = {})

```javascript
async function registerUser(overrides = {})
// overrides 可選欄位：email, password, name
// 回傳：{ token, user }
```

動態生成唯一 email（`test-${Date.now()}-${random}@example.com`）並註冊新使用者，回傳 token 和 user 物件。

適合需要獨立使用者的測試使用，每次呼叫都建立不同帳號，避免測試間干擾。

## 撰寫新測試的步驟

1. 在 `tests/` 建立新的 `*.test.js` 檔案
2. 在 `vitest.config.js` 的 `sequence.files` 陣列中加入檔案路徑（指定執行順序）
3. 從 `setup.js` 引入需要的輔助函式

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');

describe('Your Feature API', () => {
  let token;

  beforeAll(async () => {
    const { token: t } = await registerUser();
    token = t;
  });

  it('should do something', async () => {
    const res = await request(app)
      .get('/api/your-endpoint')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
  });
});
```

## 常見陷阱

### 1. 購物車測試需指定明確 session ID

訪客購物車依賴 `X-Session-Id`，應使用固定值避免跨測試干擾：

```javascript
const sessionId = 'test-session-' + Date.now();
// 在同一個 describe 區塊中持續使用同一個 sessionId
```

### 2. 建立訂單後購物車自動清空

建立訂單的 API 會清空購物車（transaction 中的 DELETE）。若後續測試需要再次建立訂單，必須先重新加入購物車。

### 3. bcrypt 在測試環境下

`NODE_ENV=test` 時，種子管理員的 bcrypt salt rounds = 1，但透過 `registerUser()` 呼叫的 `POST /api/auth/register` 仍使用 rounds = 10（因為 register route 寫死 10）。這可能使 auth 測試中的 register 較慢，`hookTimeout: 10000` 是為此預留緩衝。

### 4. 測試共用同一資料庫

所有測試共用 `database.sqlite`。種子資料（8 個商品、1 個 admin 帳號）在 app 啟動時建立（IF NOT EXISTS）。測試執行後，測試期間建立的使用者、訂單、商品等資料會殘留。若需要乾淨的環境，可以刪除 `database.sqlite` 再執行測試。

### 5. 管理員商品刪除測試

`adminProducts.test.js` 的刪除測試在確認商品消失時，呼叫的是前台 `GET /api/products/:id`（無需 admin token），這樣可以同時驗證前台也看不到該商品。

### 6. 訂單狀態過濾測試

`adminOrders.test.js` 的 `should filter orders by status` 驗證每筆回傳訂單的 status 都等於過濾條件。但若 status 過濾的不是有效值（非 pending/paid/failed），後端會忽略過濾，回傳所有訂單，不會報錯。

## 測試覆蓋的邊界情境

| 測試案例 | 對應檔案 | 說明 |
|---------|---------|------|
| 重複 email 註冊 → 409 | auth.test.js | CONFLICT 處理 |
| 錯誤密碼登入 → 401 | auth.test.js | 認證失敗 |
| 無 token 存取受保護路由 → 401 | auth.test.js | 認證缺失 |
| 非存在商品 → 404 | products.test.js | 資源不存在 |
| 分頁參數 | products.test.js | page=1&limit=2 |
| Guest 模式購物車完整流程 | cart.test.js | add/get/update/delete |
| JWT 模式加入購物車 | cart.test.js | 認證模式切換 |
| 非存在商品加入購物車 → 404 | cart.test.js | 商品驗證 |
| 空購物車建立訂單 → 400 | orders.test.js | CART_EMPTY |
| 未登入建立訂單 → 401 | orders.test.js | 認證必要 |
| 非存在訂單 → 404 | orders.test.js | 隔離驗證 |
| 一般使用者存取 admin → 403 | adminProducts.test.js | FORBIDDEN |
| 未登入存取 admin → 401 | adminProducts.test.js | 認證缺失 |
| status 過濾訂單 | adminOrders.test.js | 查詢參數過濾 |
| 後台訂單含使用者資訊 | adminOrders.test.js | user 欄位 JOIN |
