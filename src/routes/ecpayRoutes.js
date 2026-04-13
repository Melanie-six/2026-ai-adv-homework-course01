const express = require('express');
const router = express.Router();
const db = require('../database');
const { queryTradeInfo, verifyCheckMacValue, orderIdToTradeNo } = require('../ecpay');

/**
 * GET /ecpay/return
 *
 * ECPay 的 ClientBackURL — 使用者在綠界付款後點「返回商店」觸發。
 * 此路由主動呼叫 QueryTradeInfo API 確認付款狀態，再更新訂單並 redirect。
 */
router.get('/return', async (req, res) => {
  const { orderId } = req.query;

  if (!orderId) {
    return res.redirect('/orders');
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

  if (!order) {
    return res.redirect('/orders');
  }

  // 已完成付款 → 直接 redirect
  if (order.status === 'paid') {
    return res.redirect(`/orders/${orderId}?payment=success`);
  }

  // 非 pending 且非 paid（例如 failed）→ redirect
  if (order.status !== 'pending') {
    return res.redirect(`/orders/${orderId}?payment=failed`);
  }

  try {
    const merchantTradeNo = order.merchant_trade_no || orderIdToTradeNo(orderId);
    const tradeInfo = await queryTradeInfo(merchantTradeNo);

    if (tradeInfo.TradeStatus === '1') {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', orderId);
      return res.redirect(`/orders/${orderId}?payment=success`);
    } else {
      // 尚未付款確認（使用者可能按取消或尚未完成）
      return res.redirect(`/orders/${orderId}?payment=pending`);
    }
  } catch (err) {
    console.error('[ECPay] /ecpay/return QueryTradeInfo 失敗:', err.message);
    return res.redirect(`/orders/${orderId}`);
  }
});

/**
 * POST /ecpay/notify
 *
 * ECPay 的 ReturnURL — 綠界伺服器主動 POST 付款結果。
 * 本地端不會被呼叫，但部署後需正確處理。
 * 必須回傳 '1|OK'（純文字 HTTP 200），否則 ECPay 會重試。
 */
router.post('/notify', (req, res) => {
  const data = req.body;

  if (!verifyCheckMacValue(data)) {
    console.error('[ECPay] /ecpay/notify CheckMacValue 驗證失敗');
    return res.type('text').send('1|OK');
  }

  if (data.RtnCode === '1') {
    const merchantTradeNo = data.MerchantTradeNo;
    const order = db.prepare('SELECT * FROM orders WHERE merchant_trade_no = ?').get(merchantTradeNo);

    if (order && order.status === 'pending') {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', order.id);
    }
  }

  res.type('text').send('1|OK');
});

module.exports = router;
