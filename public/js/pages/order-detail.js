const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    const paymentResult = ref(el.dataset.paymentResult || null);

    const order = ref(null);
    const loading = ref(true);
    const paying = ref(false);    // 前往綠界付款按鈕
    const checking = ref(false);  // 查詢付款狀態按鈕

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    const paymentMessages = {
      success: { text: '付款成功！感謝您的購買。', cls: 'bg-sage/10 text-sage border border-sage/20' },
      failed: { text: '付款失敗，請重試。', cls: 'bg-red-50 text-red-600 border border-red-100' },
      cancel: { text: '付款已取消。', cls: 'bg-apricot/10 text-apricot border border-apricot/20' },
      pending: { text: '尚未收到付款確認，請點「查詢付款狀態」或稍後再試。', cls: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
    };

    function submitEcpayForm(actionUrl, params) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = actionUrl;
      form.acceptCharset = 'UTF-8';
      Object.entries(params).forEach(function ([key, value]) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    }

    async function handleEcpayPay() {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay-form');
        const { actionUrl, params } = res.data;
        // 提交後頁面離開，不 reset paying
        submitEcpayForm(actionUrl, params);
      } catch (e) {
        Notification.show(e?.data?.message || '無法取得付款資訊，請稍後再試', 'error');
        paying.value = false;
      }
    }

    async function handleCheckPayment() {
      if (!order.value || checking.value) return;
      checking.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/check-payment', {
          method: 'POST'
        });
        order.value = res.data;
        if (res.data.status === 'paid') {
          paymentResult.value = 'success';
          Notification.show('付款確認成功！', 'success');
        } else {
          paymentResult.value = 'pending';
          Notification.show('尚未確認付款，請完成付款後再查詢', 'error');
        }
      } catch (e) {
        Notification.show(e?.data?.message || '查詢失敗，請稍後再試', 'error');
      } finally {
        checking.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    return {
      order, loading, paying, checking,
      paymentResult, statusMap, paymentMessages,
      handleEcpayPay, handleCheckPayment
    };
  }
}).mount('#app');
