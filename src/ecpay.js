const crypto = require('crypto');

const ECPAY_URLS = {
  staging: {
    checkout: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
    query: 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5',
  },
  production: {
    checkout: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
    query: 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5',
  },
};

function getUrls() {
  const env = process.env.ECPAY_ENV === 'production' ? 'production' : 'staging';
  return ECPAY_URLS[env];
}

/**
 * PHP urlencode 等效實作
 * Node.js 的 encodeURIComponent 不會 encode ! ' ( ) * ，但 PHP urlencode 會。
 * ECPay 的 CheckMacValue 規格以 PHP urlencode 為基準，必須手動補上這些字元。
 */
function phpUrlencode(source) {
  return encodeURIComponent(String(source))
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%20/g, '+');
}

/**
 * ECPay 專用 URL encode（用於 CheckMacValue SHA256 模式）
 * 流程：phpUrlencode → ~ 替換為 %7E → 全部轉小寫 → .NET 特殊字元還原
 */
function ecpayUrlEncode(source) {
  let encoded = phpUrlencode(source);
  encoded = encoded.replace(/~/g, '%7E');
  encoded = encoded.toLowerCase();
  const restorations = [
    ['%2d', '-'],
    ['%5f', '_'],
    ['%2e', '.'],
    ['%21', '!'],
    ['%2a', '*'],
    ['%28', '('],
    ['%29', ')'],
  ];
  for (const [from, to] of restorations) {
    encoded = encoded.split(from).join(to);
  }
  return encoded;
}

/**
 * 計算 CheckMacValue（SHA256）
 */
function generateCheckMacValue(params) {
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIv = process.env.ECPAY_HASH_IV;

  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'CheckMacValue')
  );

  const sorted = Object.keys(filtered).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  const paramStr = sorted.map(k => `${k}=${filtered[k]}`).join('&');
  const raw = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(raw);

  return crypto.createHash('sha256').update(encoded, 'utf8').digest('hex').toUpperCase();
}

/**
 * 驗證 CheckMacValue（timing-safe）
 */
function verifyCheckMacValue(params) {
  const received = params.CheckMacValue || '';
  const calculated = generateCheckMacValue(params);
  if (received.length !== calculated.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(calculated));
}

/**
 * orderId（UUID）→ ECPay MerchantTradeNo（20 碼英數字）
 * suffix 為時間戳後綴，重試付款時傳入以產生不同編號
 */
function orderIdToTradeNo(orderId, suffix = '') {
  const base = orderId.replace(/-/g, '');
  if (!suffix) return base.substring(0, 20);
  const s = String(suffix);
  return base.substring(0, 20 - s.length) + s;
}

/**
 * 取得台灣時間字串（UTC+8），格式：yyyy/MM/dd HH:mm:ss
 */
function getTaiwanDateStr() {
  const tw = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const yyyy = tw.getUTCFullYear();
  const mm = String(tw.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(tw.getUTCDate()).padStart(2, '0');
  const hh = String(tw.getUTCHours()).padStart(2, '0');
  const mi = String(tw.getUTCMinutes()).padStart(2, '0');
  const ss = String(tw.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

/**
 * 組裝商品名稱字串（以 # 分隔，限制 200 字元）
 */
function buildItemName(items) {
  const raw = items.map(i => `${i.product_name} x${i.quantity}`).join('#');
  return raw.length > 200 ? raw.substring(0, 200) : raw;
}

/**
 * 組裝 ECPay AIO 所有參數（含 CheckMacValue）
 * @param {object} order - orders 表的訂單資料
 * @param {Array}  items - order_items 表的商品列表
 * @returns {{ params: object, actionUrl: string }}
 */
function buildAioParams(order, items) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const urls = getUrls();

  const suffix = String(Math.floor(Date.now() / 1000)).slice(-6);
  const params = {
    MerchantID: process.env.ECPAY_MERCHANT_ID,
    MerchantTradeNo: orderIdToTradeNo(order.id, suffix),
    MerchantTradeDate: getTaiwanDateStr(),
    PaymentType: 'aio',
    TotalAmount: Math.round(order.total_amount),
    TradeDesc: '花卉電商購物',
    ItemName: buildItemName(items),
    ReturnURL: `${baseUrl}/ecpay/notify`,
    ChoosePayment: 'Credit',
    EncryptType: 1,
    ClientBackURL: `${baseUrl}/ecpay/return?orderId=${order.id}`,
  };

  params.CheckMacValue = generateCheckMacValue(params);

  return { params, actionUrl: urls.checkout };
}

/**
 * 主動查詢綠界交易結果（QueryTradeInfo V5）
 * @param {string} merchantTradeNo - 20 碼商店訂單編號
 * @returns {Promise<object>} - 解析後的回應物件，含 TradeStatus 等欄位
 */
async function queryTradeInfo(merchantTradeNo) {
  const urls = getUrls();
  const timestamp = Math.floor(Date.now() / 1000);

  const params = {
    MerchantID: process.env.ECPAY_MERCHANT_ID,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(timestamp),
  };
  params.CheckMacValue = generateCheckMacValue(params);

  const formData = new URLSearchParams(params).toString();

  const response = await fetch(urls.query, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`ECPay QueryTradeInfo HTTP ${response.status}`);
  }

  const text = await response.text();
  return Object.fromEntries(new URLSearchParams(text));
}

module.exports = {
  generateCheckMacValue,
  verifyCheckMacValue,
  buildAioParams,
  queryTradeInfo,
  orderIdToTradeNo,
};
