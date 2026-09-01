const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { checkAndAwardBadges } = require('../lib/badges');

const router = express.Router();

const MAX_DAYS = 14;
const MAX_EXERCISES_PER_DAY = 20;
const MAX_MEALS = 12;

function clampStr(v, max) {
  return String(v ?? '').slice(0, max);
}

function sanitizeDays(days) {
  if (!Array.isArray(days)) return [];
  return days.slice(0, MAX_DAYS).map((d) => ({
    label: clampStr(d?.label, 80),
    exercises: Array.isArray(d?.exercises)
      ? d.exercises.slice(0, MAX_EXERCISES_PER_DAY).map((e) => ({
          name: clampStr(e?.name, 100),
          sets: Number.isFinite(Number(e?.sets)) ? Number(e.sets) : null,
          reps: clampStr(e?.reps, 30),
          video_url: clampStr(e?.video_url, 300),
          notes: clampStr(e?.notes, 200),
        }))
      : [],
  }));
}

function sanitizeMeals(meals) {
  if (!Array.isArray(meals)) return [];
  return meals.slice(0, MAX_MEALS).map((m) => ({
    label: clampStr(m?.label, 40),
    description: clampStr(m?.description, 300),
  }));
}

router.get('/:subscriptionId/workout', requireAuth, requireSubscriptionParty, (req, res) => {
  const row = db.prepare('SELECT * FROM workout_plans WHERE subscription_id = ?').get(req.sub.id);
  res.json({ plan: row ? { ...row, days: JSON.parse(row.days_json) } : null });
});

router.put('/:subscriptionId/workout', requireAuth, requireSubscriptionParty, (req, res) => {
  if (!req.isCoach) return res.status(403).json({ error: 'الكوتش بس اللي يقدر يعدّل برنامج التمرين' });
  const title = clampStr(req.body.title, 80);
  const days = sanitizeDays(req.body.days);
  db.prepare(
    `INSERT INTO workout_plans (subscription_id, title, days_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(subscription_id) DO UPDATE SET title=excluded.title, days_json=excluded.days_json, updated_at=datetime('now')`
  ).run(req.sub.id, title, JSON.stringify(days));
  checkAndAwardBadges(req.sub.id);
  res.json({ ok: true });
});

router.get('/:subscriptionId/nutrition', requireAuth, requireSubscriptionParty, (req, res) => {
  const row = db.prepare('SELECT * FROM nutrition_plans WHERE subscription_id = ?').get(req.sub.id);
  res.json({ plan: row ? { ...row, meals: JSON.parse(row.meals_json) } : null });
});

router.put('/:subscriptionId/nutrition', requireAuth, requireSubscriptionParty, (req, res) => {
  if (!req.isCoach) return res.status(403).json({ error: 'الكوتش بس اللي يقدر يعدّل خطة التغذية' });
  const dailyCalories = Number.isFinite(Number(req.body.daily_calories)) ? Number(req.body.daily_calories) : null;
  const notes = clampStr(req.body.notes, 300);
  const meals = sanitizeMeals(req.body.meals);
  db.prepare(
    `INSERT INTO nutrition_plans (subscription_id, daily_calories, notes, meals_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(subscription_id) DO UPDATE SET daily_calories=excluded.daily_calories, notes=excluded.notes, meals_json=excluded.meals_json, updated_at=datetime('now')`
  ).run(req.sub.id, dailyCalories, notes, JSON.stringify(meals));
  res.json({ ok: true });
});

module.exports = router;
