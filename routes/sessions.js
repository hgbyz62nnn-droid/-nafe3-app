const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { checkAndAwardBadges } = require('../lib/badges');

const router = express.Router();

router.get('/:subscriptionId', requireAuth, requireSubscriptionParty, (req, res) => {
  const sessions = db
    .prepare('SELECT * FROM booked_sessions WHERE subscription_id = ? ORDER BY scheduled_at ASC')
    .all(req.sub.id);
  res.json({ sessions });
});

router.post('/:subscriptionId', requireAuth, requireSubscriptionParty, (req, res) => {
  if (req.isCoach) return res.status(403).json({ error: 'المتدرب بس اللي يحجز الميعاد' });
  const scheduledAt = new Date(req.body.scheduled_at);
  if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'اختار ميعاد في المستقبل' });
  }
  const notes = String(req.body.notes ?? '').slice(0, 200);
  db.prepare(
    'INSERT INTO booked_sessions (subscription_id, scheduled_at, notes) VALUES (?, ?, ?)'
  ).run(req.sub.id, scheduledAt.toISOString(), notes || null);
  res.json({ ok: true });
});

router.post('/:subscriptionId/:sessionId/status', requireAuth, requireSubscriptionParty, (req, res) => {
  const status = req.body.status;
  if (!['completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'حالة غير صحيحة' });
  }
  // الكوتش يقدر يعلّم أي حالة (خصوصًا "مكتملة")، المتدرب يقدر بس يلغي حجزه.
  if (!req.isCoach && status !== 'cancelled') {
    return res.status(403).json({ error: 'الكوتش بس اللي يقدر يعلّم الجلسة كمكتملة' });
  }
  const session = db
    .prepare('SELECT * FROM booked_sessions WHERE id = ? AND subscription_id = ?')
    .get(req.params.sessionId, req.sub.id);
  if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });

  db.prepare('UPDATE booked_sessions SET status = ? WHERE id = ?').run(status, session.id);
  if (status === 'completed') checkAndAwardBadges(req.sub.id);
  res.json({ ok: true });
});

module.exports = router;
