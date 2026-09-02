const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const { createPaymentSession, isConfigured, verifyWebhookHmac } = require('../lib/paymob');
const { computeCommission } = require('../lib/commission');

const router = express.Router();

const PACKAGE_MONTHS = { '1m': 1, '3m': 3, '6m': 6 };

// بيتنادى لما اشتراك يتأكد دفعه. اليوزر بيدفع لأول مرة لكل اشتراك، فمينفعش
// النداء ده يتكرر لنفس الاشتراك (غير كده رقم عميل الكوتش هيتزود غلط).
function activateSubscription(sub) {
  if (sub.status === 'active') return;

  const months = PACKAGE_MONTHS[sub.package];
  const expires = new Date();
  expires.setMonth(expires.getMonth() + months);

  const priorCount = db
    .prepare("SELECT COUNT(*) AS c FROM subscriptions WHERE coach_id = ? AND status IN ('active','expired')")
    .get(sub.coach_id).c;
  const clientNumber = priorCount + 1;
  const { rate, commissionAmount, coachPayout } = computeCommission(sub.amount, clientNumber);

  db.prepare(
    `UPDATE subscriptions
     SET status='active', expires_at=?, client_number=?, commission_rate=?, commission_amount=?, coach_payout=?
     WHERE id=?`
  ).run(expires.toISOString(), clientNumber, rate, commissionAmount, coachPayout, sub.id);
}

router.post('/', requireAuth, requireRole('trainee'), async (req, res) => {
  const { coachId, package: pkg } = req.body;
  if (!PACKAGE_MONTHS[pkg]) return res.status(400).json({ error: 'باقة غير معروفة' });

  const coach = db
    .prepare("SELECT * FROM coach_profiles WHERE user_id = ? AND status = 'approved'")
    .get(coachId);
  if (!coach) return res.status(404).json({ error: 'المدرب غير متاح' });

  const priceMap = { '1m': coach.price_1m, '3m': coach.price_3m, '6m': coach.price_6m };
  const amount = priceMap[pkg];

  const info = db
    .prepare(
      `INSERT INTO subscriptions (trainee_id, coach_id, package, amount, status)
       VALUES (?, ?, ?, ?, 'pending_payment')`
    )
    .run(req.user.id, coachId, pkg, amount);

  const orderRef = `sub_${info.lastInsertRowid}`;

  try {
    const session = await createPaymentSession({
      amountEgp: amount,
      orderRef,
      billing: {
        first_name: req.user.name || 'Trainee',
        last_name: 'Traino',
        email: 'trainee@example.com',
        phone_number: '+201000000000',
        apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA', city: 'Ismailia', country: 'EG',
      },
    });
    db.prepare('UPDATE subscriptions SET payment_ref = ? WHERE id = ?').run(orderRef, info.lastInsertRowid);
    res.json({ subscriptionId: info.lastInsertRowid, checkoutUrl: session.checkoutUrl, mock: session.mock });
  } catch (err) {
    res.status(500).json({ error: 'حصل خطأ في بدء عملية الدفع', details: err.message });
  }
});

// Test-only shortcut for trying the app without a real Paymob integration.
// Locked down two ways: only the trainee who owns the subscription can call
// it, and it stops working the moment real Paymob credentials are set, so
// it can never be used to activate a subscription for free once payments
// are actually live.
router.post('/:id/mock-confirm', requireAuth, requireRole('trainee'), (req, res) => {
  if (isConfigured()) return res.status(403).json({ error: 'الدفع الحقيقي شغال، مينفعش تفعيل تجريبي' });

  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  if (sub.trainee_id !== req.user.id) return res.status(403).json({ error: 'مش معاك صلاحية' });

  activateSubscription(sub);
  res.json({ ok: true });
});

router.post('/webhook/paymob', express.json(), (req, res) => {
  const { obj } = req.body || {};
  if (!verifyWebhookHmac(obj, req.query.hmac)) {
    console.log('⚠️ Paymob webhook: HMAC غلط أو مش موجود - اتجاهل');
    return res.sendStatus(400);
  }
  if (obj?.success && obj?.order?.merchant_order_id) {
    const orderRef = obj.order.merchant_order_id;
    const subId = orderRef.replace('sub_', '');
    const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId);
    if (sub) activateSubscription(sub);
  }
  res.sendStatus(200);
});

router.get('/mine', requireAuth, (req, res) => {
  const col = req.user.role === 'trainee' ? 'trainee_id' : 'coach_id';
  const seenCol = req.user.role === 'trainee' ? 's.trainee_last_seen_at' : 's.coach_last_seen_at';
  const subs = db
    .prepare(
      `SELECT s.*, u.name AS other_party_name, u.avatar_path AS other_party_avatar,
         (SELECT content FROM messages WHERE subscription_id = s.id ORDER BY id DESC LIMIT 1) AS last_message,
         (SELECT created_at FROM messages WHERE subscription_id = s.id ORDER BY id DESC LIMIT 1) AS last_message_at,
         (SELECT COUNT(*) FROM messages WHERE subscription_id = s.id AND sender_id != ?
           AND (${seenCol} IS NULL OR created_at > ${seenCol})) AS unread_count
       FROM subscriptions s
       JOIN users u ON u.id = ${col === 'trainee_id' ? 's.coach_id' : 's.trainee_id'}
       WHERE s.${col} = ?`
    )
    .all(req.user.id, req.user.id);
  res.json({ subscriptions: subs });
});

router.get('/:id', requireAuth, (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  if (!sub || (sub.trainee_id !== req.user.id && sub.coach_id !== req.user.id)) {
    return res.status(404).json({ error: 'الاشتراك غير موجود' });
  }
  const otherId = req.user.id === sub.trainee_id ? sub.coach_id : sub.trainee_id;
  const otherParty = db.prepare('SELECT id, name, avatar_path FROM users WHERE id = ?').get(otherId);
  res.json({ subscription: sub, otherParty });
});

router.get('/admin/all', requireAdmin, (req, res) => {
  const subs = db
    .prepare(
      `SELECT s.*, t.name AS trainee_name, c.name AS coach_name
       FROM subscriptions s
       JOIN users t ON t.id = s.trainee_id
       JOIN users c ON c.id = s.coach_id
       ORDER BY s.id DESC`
    )
    .all();
  res.json({ subscriptions: subs });
});

module.exports = router;
