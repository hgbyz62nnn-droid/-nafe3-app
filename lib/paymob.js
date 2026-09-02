// تكامل Paymob (بوابة الدفع المصرية).
//
// ⚠️ مهم: الـ API بتاع Paymob بيتغيّر وليه أكتر من نسخة (Accept API القديم
// و Intention API الجديد). الكود ده مبني على تدفق "Accept API" التقليدي
// (auth token -> order -> payment key -> iframe) اللي كان شغال وقت الكتابة.
// قبل ما تشغّله فعلي، افتح https://docs.paymob.com وتأكد إن الخطوات
// لسه مطابقة، لأن بوابات الدفع بتحدّث الـ API بتاعها بين كام شهر.
//
// لحد ما تحط المفاتيح في .env، الدالة دي هتشتغل في "وضع تجريبي" وترجع
// رابط وهمي عشان تقدر تكمل تجربة باقي التطبيق.

const fetch = require('node-fetch');
const crypto = require('crypto');

const PAYMOB_BASE = 'https://accept.paymob.com/api';

function isConfigured() {
  return !!(process.env.PAYMOB_API_KEY && process.env.PAYMOB_INTEGRATION_ID && process.env.PAYMOB_IFRAME_ID);
}

// Fields Paymob concatenates (in this exact order) to compute the HMAC on a
// "transaction processed" callback. Re-check this order against
// https://docs.paymob.com before going live - payment gateways change these.
const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
  'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
  'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
];

function getField(obj, path) {
  return path.split('.').reduce((v, key) => (v === undefined || v === null ? v : v[key]), obj);
}

// Verifies the `hmac` query param Paymob appends to webhook callbacks, so we
// only ever trust a "payment succeeded" notification that actually came from
// Paymob and wasn't forged by posting straight to this endpoint.
function verifyWebhookHmac(transactionObj, receivedHmac) {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret || !receivedHmac) return false;
  const concatenated = HMAC_FIELDS.map((f) => {
    const v = getField(transactionObj, f);
    return v === undefined || v === null ? '' : String(v);
  }).join('');
  const computed = crypto.createHmac('sha512', secret).update(concatenated).digest('hex');
  const a = Buffer.from(computed);
  const b = Buffer.from(String(receivedHmac));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createPaymentSession({ amountEgp, orderRef, billing }) {
  if (!isConfigured()) {
    return {
  
      mock: true,
      checkoutUrl: `/mock-checkout.html?ref=${encodeURIComponent(orderRef)}&amount=${amountEgp}`,
    };
  }

  const amountCents = Math.round(amountEgp * 100);

  const authRes = await fetch(`${PAYMOB_BASE}/auth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: process.env.PAYMOB_API_KEY }),
  });
  const authData = await authRes.json();
  if (!authData.token) throw new Error('Paymob auth failed: ' + JSON.stringify(authData));

  const orderRes = await fetch(`${PAYMOB_BASE}/ecommerce/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token: authData.token,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: 'EGP',
      merchant_order_id: orderRef,
      items: [],
    }),
  });
  const orderData = await orderRes.json();
  if (!orderData.id) throw new Error('Paymob order failed: ' + JSON.stringify(orderData));

  const keyRes = await fetch(`${PAYMOB_BASE}/acceptance/payment_keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token: authData.token,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderData.id,
      billing_data: billing,
      currency: 'EGP',
      integration_id: Number(process.env.PAYMOB_INTEGRATION_ID),
    }),
  });
  const keyData = await keyRes.json();
  if (!keyData.token) throw new Error('Paymob payment key failed: ' + JSON.stringify(keyData));

  const checkoutUrl = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${keyData.token}`;
  return { mock: false, checkoutUrl };
}

module.exports = { createPaymentSession, isConfigured, verifyWebhookHmac };
