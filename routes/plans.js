const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { checkAndAwardBadges } = require('../lib/badges');

const router = express.Router();

const MAX_DAYS = 14;
const MAX_EXERCISES_PER_DAY = 20;
const MAX_MEALS = 12;
const MAX_FOODS_PER_MEAL = 15;
const MAX_TEMPLATES = 30;
const EXERCISE_TYPES = ['normal', 'superset', 'dropset', 'warmup', 'cooldown'];

function clampStr(v, max) {
  return String(v ?? '').slice(0, max);
}

// Number(null) === 0 و Number(undefined) === NaN، فمينفعش نعتمد على
// Number.isFinite(Number(v)) لوحده عشان نميّز "الحقل فاضي" عن "الحقل صفر" -
// لازم نستبعد null/undefined/'' يدويًا الأول قبل التحويل.
function toNullableNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeDays(days) {
  if (!Array.isArray(days)) return [];
  return days.slice(0, MAX_DAYS).map((d) => ({
    label: clampStr(d?.label, 80),
    exercises: Array.isArray(d?.exercises)
      ? d.exercises.slice(0, MAX_EXERCISES_PER_DAY).map((e) => {
          const rpe = toNullableNumber(e?.rpe);
          return {
            name: clampStr(e?.name, 100),
            sets: toNullableNumber(e?.sets),
            reps: clampStr(e?.reps, 30),
            weight: clampStr(e?.weight, 30),
            rest: clampStr(e?.rest, 30),
            tempo: clampStr(e?.tempo, 20),
            rpe: rpe === null ? null : Math.min(10, Math.max(1, rpe)),
            type: EXERCISE_TYPES.includes(e?.type) ? e.type : 'normal',
            video_url: clampStr(e?.video_url, 300),
            notes: clampStr(e?.notes, 200),
          };
        })
      : [],
  }));
}

function sanitizeFoods(foods) {
  if (!Array.isArray(foods)) return [];
  return foods.slice(0, MAX_FOODS_PER_MEAL).map((f) => ({
    name: clampStr(f?.name, 100),
    quantity: clampStr(f?.quantity, 40),
    calories: toNullableNumber(f?.calories),
    protein: toNullableNumber(f?.protein),
    carbs: toNullableNumber(f?.carbs),
    fat: toNullableNumber(f?.fat),
    alternative: clampStr(f?.alternative, 150),
  }));
}

function sanitizeMeals(meals) {
  if (!Array.isArray(meals)) return [];
  return meals.slice(0, MAX_MEALS).map((m) => ({
    label: clampStr(m?.label, 40),
    time: clampStr(m?.time, 20),
    description: clampStr(m?.description, 300),
    foods: sanitizeFoods(m?.foods),
  }));
}

// -------------------- قوالب برامج التمرين --------------------
// مسارات مش مربوطة باشتراك معيّن، فمنفصلة تمامًا عن requireSubscriptionParty.
// "workout-templates" مقصود كلمة واحدة مركّبة (مش /templates/workout) عشان
// تتجنب أي تداخل مع /:subscriptionId/workout في مسارات Express.

router.get('/workout-templates', requireAuth, requireRole('coach'), (req, res) => {
  const templates = db
    .prepare('SELECT id, title, created_at FROM workout_templates WHERE coach_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json({ templates });
});

router.post('/workout-templates', requireAuth, requireRole('coach'), (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM workout_templates WHERE coach_id = ?').get(req.user.id).c;
  if (count >= MAX_TEMPLATES) return res.status(400).json({ error: 'وصلت للحد الأقصى من القوالب (' + MAX_TEMPLATES + ')' });
  const title = clampStr(req.body.title, 80);
  if (!title) return res.status(400).json({ error: 'اكتب اسم للقالب' });
  const days = sanitizeDays(req.body.days);
  const info = db.prepare('INSERT INTO workout_templates (coach_id, title, days_json) VALUES (?, ?, ?)').run(req.user.id, title, JSON.stringify(days));
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.get('/workout-templates/:id', requireAuth, requireRole('coach'), (req, res) => {
  const tpl = db.prepare('SELECT * FROM workout_templates WHERE id = ?').get(req.params.id);
  if (!tpl || tpl.coach_id !== req.user.id) return res.status(404).json({ error: 'القالب غير موجود' });
  res.json({ template: { ...tpl, days: JSON.parse(tpl.days_json) } });
});

router.delete('/workout-templates/:id', requireAuth, requireRole('coach'), (req, res) => {
  const tpl = db.prepare('SELECT * FROM workout_templates WHERE id = ?').get(req.params.id);
  if (!tpl || tpl.coach_id !== req.user.id) return res.status(404).json({ error: 'القالب غير موجود' });
  db.prepare('DELETE FROM workout_templates WHERE id = ?').run(tpl.id);
  res.json({ ok: true });
});

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
  const dailyCalories = toNullableNumber(req.body.daily_calories);
  const proteinTarget = toNullableNumber(req.body.protein_target);
  const carbsTarget = toNullableNumber(req.body.carbs_target);
  const fatTarget = toNullableNumber(req.body.fat_target);
  const notes = clampStr(req.body.notes, 300);
  const meals = sanitizeMeals(req.body.meals);
  db.prepare(
    `INSERT INTO nutrition_plans (subscription_id, daily_calories, protein_target, carbs_target, fat_target, notes, meals_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(subscription_id) DO UPDATE SET daily_calories=excluded.daily_calories, protein_target=excluded.protein_target,
       carbs_target=excluded.carbs_target, fat_target=excluded.fat_target, notes=excluded.notes, meals_json=excluded.meals_json, updated_at=datetime('now')`
  ).run(req.sub.id, dailyCalories, proteinTarget, carbsTarget, fatTarget, notes, JSON.stringify(meals));
  res.json({ ok: true });
});

module.exports = router;
