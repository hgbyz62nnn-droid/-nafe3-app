const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createPaymentSession } = require('../lib/paymob');

const router = express.Router();

const PACKAGE_MONTHS = { '1m': 1, '3m': 3, '6m': 6 };

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
        last_name: 'NAFE3',
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

router.post('/:id/mock-confirm', requireAuth, (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'الاشتراك غير موجود' });

  const months = PACKAGE_MONTHS[sub.package];
  const expires = new Date();
  expires.setMonth(expires.getMonth() + months);

  db.prepare("UPDATE subscriptions SET status='active', expires_at=? WHERE id=?").run(
    expires.toISOString(),
    sub.id
  );
  res.json({ ok: true });
});

router.post('/webhook/paymob', express.json(), (req, res) => {
  const { obj } = req.body || {};
  if (obj?.success && obj?.order?.merchant_order_id) {
    const orderRef = obj.order.merchant_order_id;
    const subId = orderRef.replace('sub_', '');
    const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId);
    if (sub) {
      const months = PACKAGE_MONTHS[sub.package];
      const expires = new Date();
      expires.setMonth(expires.getMonth() + months);
      db.prepare("UPDATE subscriptions SET status='active', expires_at=? WHERE id=?").run(
        expires.toISOString(),
        sub.id
      );
    }
  }
  res.sendStatus(200);
});

router.get('/mine', requireAuth, (req, res) => {
  const col = req.user.role === 'trainee' ? 'trainee_id' : 'coach_id';
  const subs = db
    .prepare(
      `SELECT s.*, u.name AS other_party_name FROM subscriptions s
       JOIN users u ON u.id = ${col === 'trainee_id' ? 's.coach_id' : 's.trainee_id'}
       WHERE s.${col} = ?`
    )
    .all(req.user.id);
  res.json({ subscriptions: subs });
});

module.exports = router;
