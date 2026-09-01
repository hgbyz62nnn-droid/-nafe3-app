const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { checkAndAwardBadges } = require('../lib/badges');

const router = express.Router();

const MAX_HABITS = 10;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/:subscriptionId/definitions', requireAuth, requireSubscriptionParty, (req, res) => {
  const habits = db
    .prepare('SELECT * FROM habit_definitions WHERE subscription_id = ? AND active = 1 ORDER BY sort_order, id')
    .all(req.sub.id);
  res.json({ habits });
});

router.post('/:subscriptionId/definitions', requireAuth, requireSubscriptionParty, (req, res) => {
  if (!req.isCoach) return res.status(403).json({ error: 'الكوتش بس اللي يقدر يحدد العادات' });
  const label = String(req.body.label ?? '').trim().slice(0, 60);
  if (!label) return res.status(400).json({ error: 'اكتب اسم العادة' });
  const { c } = db
    .prepare('SELECT COUNT(*) AS c FROM habit_definitions WHERE subscription_id = ? AND active = 1')
    .get(req.sub.id);
  if (c >= MAX_HABITS) return res.status(400).json({ error: `أقصى عدد عادات ${MAX_HABITS}` });
  db.prepare(
    'INSERT INTO habit_definitions (subscription_id, label, sort_order) VALUES (?, ?, ?)'
  ).run(req.sub.id, label, c);
  res.json({ ok: true });
});

router.delete('/:subscriptionId/definitions/:habitId', requireAuth, requireSubscriptionParty, (req, res) => {
  if (!req.isCoach) return res.status(403).json({ error: 'الكوتش بس اللي يقدر يشيل عادة' });
  db.prepare(
    'UPDATE habit_definitions SET active = 0 WHERE id = ? AND subscription_id = ?'
  ).run(req.params.habitId, req.sub.id);
  res.json({ ok: true });
});

// آخر 30 يوم بالظبط عشان الرسم/الستريك يفضلوا خفيفين على الاستعلام.
router.get('/:subscriptionId/logs', requireAuth, requireSubscriptionParty, (req, res) => {
  const logs = db
    .prepare(
      `SELECT hl.habit_id, hl.log_date, hl.done FROM habit_logs hl
       JOIN habit_definitions hd ON hd.id = hl.habit_id
       WHERE hd.subscription_id = ? AND hl.log_date >= date('now', '-30 days')`
    )
    .all(req.sub.id);
  res.json({ logs });
});

router.post('/:subscriptionId/logs/toggle', requireAuth, requireSubscriptionParty, (req, res) => {
  if (req.isCoach) return res.status(403).json({ error: 'المتدرب بس اللي يعلّم على عاداته' });
  const habit = db
    .prepare('SELECT * FROM habit_definitions WHERE id = ? AND subscription_id = ? AND active = 1')
    .get(req.body.habit_id, req.sub.id);
  if (!habit) return res.status(404).json({ error: 'العادة غير موجودة' });

  const date = req.body.date && req.body.date <= todayStr() ? req.body.date : todayStr();
  const existing = db
    .prepare('SELECT id FROM habit_logs WHERE habit_id = ? AND log_date = ?')
    .get(habit.id, date);
  if (existing) {
    db.prepare('DELETE FROM habit_logs WHERE id = ?').run(existing.id);
    res.json({ ok: true, done: false });
  } else {
    db.prepare('INSERT INTO habit_logs (habit_id, log_date, done) VALUES (?, ?, 1)').run(habit.id, date);
    checkAndAwardBadges(req.sub.id);
    res.json({ ok: true, done: true });
  }
});

module.exports = router;
