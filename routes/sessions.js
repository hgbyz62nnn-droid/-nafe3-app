const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/adminAuth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { checkAndAwardBadges } = require('../lib/badges');
const { hasAvailabilityConfigured, computeAvailableSlots, parseRequestedDateTime } = require('../lib/availability');

const router = express.Router();

router.get('/:subscriptionId', requireAuth, requireSubscriptionParty, (req, res) => {
  const sessions = db
    .prepare('SELECT * FROM booked_sessions WHERE subscription_id = ? ORDER BY scheduled_at ASC')
    .all(req.sub.id);
  res.json({ sessions });
});

router.post('/:subscriptionId', requireAuth, requireSubscriptionParty, (req, res) => {
  if (req.isCoach) return res.status(403).json({ error: 'المتدرب بس اللي يحجز الميعاد' });
  const scheduledAt = parseRequestedDateTime(req.body);
  if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'اختار ميعاد في المستقبل' });
  }
  // لو الكوتش مظبط جدول مواعيده، الحجز لازم يقع بالظبط على فترة حقيقية
  // متاحة - بنعيد حساب الفترات من السيرفر مش بنصدّق أي وقت جاي من
  // العميل، عشان محدش يقدر يحجز خارج الجدول أو فوق معاد محجوز بالفعل.
  if (hasAvailabilityConfigured(req.sub.coach_id)) {
    const dateStr = scheduledAt.toISOString().slice(0, 10);
    const timeStr = scheduledAt.toISOString().slice(11, 16);
    const realSlots = computeAvailableSlots(req.sub.coach_id, dateStr);
    if (!realSlots.includes(timeStr)) {
      return res.status(409).json({ error: 'المعاد ده مش متاح، اختار معاد تاني من الفترات المتاحة' });
    }
  }
  const notes = String(req.body.notes ?? '').slice(0, 200);
  db.prepare(
    'INSERT INTO booked_sessions (subscription_id, scheduled_at, notes) VALUES (?, ?, ?)'
  ).run(req.sub.id, scheduledAt.toISOString(), notes || null);
  res.json({ ok: true });
});

router.post('/:subscriptionId/:sessionId/status', requireAuth, requireSubscriptionParty, (req, res) => {
  const status = req.body.status;
  if (!['completed', 'cancelled', 'no_show'].includes(status)) {
    return res.status(400).json({ error: 'حالة غير صحيحة' });
  }
  // الكوتش يقدر يعلّم أي حالة (خصوصًا "مكتملة"/"متغيّب")، المتدرب يقدر بس يلغي حجزه.
  if (!req.isCoach && status !== 'cancelled') {
    return res.status(403).json({ error: 'الكوتش بس اللي يقدر يعلّم الجلسة كمكتملة أو متغيّب عنها' });
  }
  const session = db
    .prepare('SELECT * FROM booked_sessions WHERE id = ? AND subscription_id = ?')
    .get(req.params.sessionId, req.sub.id);
  if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });

  db.prepare('UPDATE booked_sessions SET status = ? WHERE id = ?').run(status, session.id);
  if (status === 'completed') checkAndAwardBadges(req.sub.id);
  res.json({ ok: true });
});

// -------------------- الأدمن: كل الحجوزات --------------------

router.get('/admin/all', requireAdmin, requirePermission('subscriptions', 'view'), (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.status && ['scheduled', 'completed', 'cancelled', 'no_show'].includes(req.query.status)) {
    clauses.push('bs.status = ?');
    params.push(req.query.status);
  }
  if (req.query.range === 'today') {
    clauses.push("date(bs.scheduled_at) = date('now')");
  } else if (req.query.range === 'week') {
    clauses.push("date(bs.scheduled_at) BETWEEN date('now') AND date('now', '+7 days')");
  }
  const q = String(req.query.q ?? '').trim();
  if (q) {
    clauses.push('(coach.name LIKE ? OR coach.email LIKE ? OR trainee.name LIKE ? OR trainee.email LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const sessions = db
    .prepare(
      `SELECT bs.*, s.package, s.amount, s.status AS subscription_status,
         coach.name AS coach_name, coach.email AS coach_email,
         trainee.name AS trainee_name, trainee.email AS trainee_email
       FROM booked_sessions bs
       JOIN subscriptions s ON s.id = bs.subscription_id
       JOIN users coach ON coach.id = s.coach_id
       JOIN users trainee ON trainee.id = s.trainee_id
       ${where}
       ORDER BY bs.scheduled_at DESC
       LIMIT 300`
    )
    .all(...params);
  res.json({ sessions });
});

module.exports = router;
