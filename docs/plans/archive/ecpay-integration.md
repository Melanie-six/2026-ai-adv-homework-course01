# 綠界 ECPay AIO 金流串接計畫

## Context

專案目前的付款流程是模擬的（按下「付款成功」或「付款失敗」按鈕直接改狀態）。
本次要串接真實的綠界 ECPay AIO 全方位金流，讓使用者可以在綠界測試環境用信用卡付款。

**關鍵限制**：專案只在本地端執行，ECPay 的伺服器無法 POST 回 `ReturnURL`（localhost）。
因此付款結果驗證改用「本地端主動呼叫 QueryTradeInfo API」的架構。

---

## 付款流程設計

```
結帳頁面送出表單
  → POST /api/orders（建立訂單，status='pending'）
  → GET /api/orders/:id/ecpay-form（取得 ECPay 參數 JSON）
  → 前端組 hidden form 自動提交至 ECPay AIO Checkout
  → 使用者在綠界頁面用測試信用卡付款
  → 點擊「返回商店」→ 瀏覽器 GET /ecpay/return?orderId=:id
  → Server 呼叫 QueryTradeInfo → 若 TradeStatus=1 → UPDATE status='paid'
  → redirect 到 /orders/:id?payment=success
```

訂單詳情頁另提供：
- 「前往綠界付款」按鈕（適用 status=pending 訂單）
- 「查詢付款狀態」按鈕（若使用者沒點返回商店，可手動觸發查詢）

---

## MerchantTradeNo 設計

```javascript
// orderId 是 UUID，去掉連字號取前 20 碼，只含英數字
function orderIdToTradeNo(orderId) {
  return orderId.replace(/-/g, '').substring(0, 20);
}
```

同時在 orders 表新增 `merchant_trade_no TEXT` 欄位，
在產生 ECPay 參數時寫入，讓 `/ecpay/notify` 可以反查訂單。

---

## 測試帳號（已在 .env）

| 項目 | 值 |
|------|-----|
| MerchantID | `3002607` |
| HashKey | `pwFHCqoQZGmho4w6` |
| HashIV | `EkRm7iFT261dpevs` |
| 測試信用卡 | `4311-9522-2222-2222`，任意未到期日，CVV 任意，3DS: `1234` |
| AIO Checkout URL | `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5` |
| QueryTradeInfo URL | `https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5` |

---

## CheckMacValue 演算法（SHA256）

```
1. 移除 CheckMacValue 欄位
2. 按 key 名不分大小寫字母排序
3. 組成字串：HashKey={key}&k1=v1&k2=v2...&HashIV={iv}
4. ECPay URL encode：
   encodeURIComponent → 空白換成 + → 轉小寫
   → 還原：%2d→- %5f→_ %2e→. %21→! %2a→* %28→( %29→)
5. SHA256 hash → 全部大寫
```

---

## 新建檔案

### 1. `src/ecpay.js`

匯出：
- `generateCheckMacValue(params)` — 計算 CheckMacValue
- `verifyCheckMacValue(params)` — 驗證（timing-safe）
- `buildAioParams(order, items)` — 組 ECPay AIO 所有參數（含 CheckMacValue）
- `queryTradeInfo(merchantTradeNo)` — 呼叫 QueryTradeInfo API，回傳 parsed 物件
- `orderIdToTradeNo(orderId)` — UUID → 20 碼英數字

ECPay AIO 必填參數：

| 參數 | 值 |
|------|----|
| MerchantID | env.ECPAY_MERCHANT_ID |
| MerchantTradeNo | `orderId.replace(/-/g,'').substring(0,20)` |
| MerchantTradeDate | UTC+8 時間，格式 `yyyy/MM/dd HH:mm:ss` |
| PaymentType | `'aio'` |
| TotalAmount | `order.total_amount`（整數） |
| TradeDesc | `'花卉電商購物'` |
| ItemName | 訂單商品以 `#` 連接，截斷到 200 字元 |
| ReturnURL | `BASE_URL + '/ecpay/notify'`（本地不會被呼叫，但必填） |
| ChoosePayment | `'Credit'` |
| EncryptType | `1` |
| ClientBackURL | `BASE_URL + '/ecpay/return?orderId=' + order.id` |

### 2. `src/routes/ecpayRoutes.js`

- `GET /ecpay/return`（ClientBackURL，不需 authMiddleware）
  - 呼叫 QueryTradeInfo → TradeStatus=1 → UPDATE paid → redirect ?payment=success
  - 其他 → redirect ?payment=pending；例外 → redirect /orders/:id
- `POST /ecpay/notify`（ReturnURL，本地不觸發，部署後用）
  - 驗證 CheckMacValue → RtnCode=1 → UPDATE paid → 回傳 `'1|OK'`

---

## 修改的檔案

### 3. `src/database.js`

```javascript
// 新增 merchant_trade_no 欄位（若不存在）
const orderCols = db.prepare('PRAGMA table_info(orders)').all();
if (!orderCols.some(c => c.name === 'merchant_trade_no')) {
  db.prepare('ALTER TABLE orders ADD COLUMN merchant_trade_no TEXT').run();
}
```

### 4. `src/routes/orderRoutes.js`

- 新增 `GET /:id/ecpay-form`：組 ECPay 參數，寫入 merchant_trade_no，回傳 JSON
- 新增 `POST /:id/check-payment`：呼叫 QueryTradeInfo，更新並回傳訂單狀態
- 移除舊的 `PATCH /:id/pay`（模擬付款）

### 5. `app.js`

在 pageRoutes 前加入：
```javascript
app.use('/ecpay', require('./src/routes/ecpayRoutes'));
```

### 6. `public/js/pages/checkout.js`

結帳成功後改呼叫 `/api/orders/:id/ecpay-form` 取得參數，動態組 form 並 submit。
注意：成功跳轉後不要 reset `submitting`（頁面已離開）。

### 7. `views/pages/order-detail.ejs`

Payment Buttons 區塊換成：
- 「前往綠界付款」按鈕 → `handleEcpayPay`
- 「查詢付款狀態」按鈕 → `handleCheckPayment`

### 8. `public/js/pages/order-detail.js`

移除 `simulatePay` / `handlePaySuccess` / `handlePayFail`，新增：
- `handleEcpayPay`：取 ECPay 參數 → 組 form → submit
- `handleCheckPayment`：呼叫 check-payment API → 更新 order / paymentResult
- `paymentMessages` 新增 `pending` 狀態

---

## 驗證步驟

1. Node REPL 確認 CheckMacValue 計算正確
2. curl 測試 `/api/orders/:id/ecpay-form` 回傳格式
3. 端對端：登入 → 加購 → 結帳 → 綠界付款 → 返回商店 → 確認狀態 = 已付款
4. 測試「查詢付款狀態」按鈕（不點返回商店的情況）
5. 確認重複點擊按鈕時 disabled 生效
6. 確認已付款訂單不顯示付款按鈕
