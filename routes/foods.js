const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { clampStr, toNullableNumber } = require('../lib/sanitize');

const router = express.Router();

const CATEGORIES = ['protein', 'carb', 'fat', 'vegetable', 'fruit', 'dairy'];
const MAX_CUSTOM_FOODS = 200;

function sanitizeMacro(v) {
  const n = toNullableNumber(v);
  if (n === null) return 0;
  return Math.max(0, Math.min(2000, n));
}

router.get('/', requireAuth, requireRole('coach'), (req, res) => {
  const scope = ['all', 'favorites', 'mine'].includes(req.query.scope) ? req.query.scope : 'all';
  const clauses = [];
  const params = [];

  if (scope === 'mine') {
    clauses.push('f.coach_id = ?');
    params.push(req.user.id);
  } else {
    clauses.push('(f.coach_id IS NULL OR f.coach_id = ?)');
    params.push(req.user.id);
  }
  if (scope === 'favorites') {
    clauses.push('fav.coach_id IS NOT NULL');
  }
  if (req.query.search) {
    clauses.push('f.name LIKE ?');
    params.push('%' + String(req.query.search).slice(0, 60) + '%');
  }
  if (CATEGORIES.includes(req.query.category)) {
    clauses.push('f.category = ?');
    params.push(req.query.category);
  }

  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const foods = db
    .prepare(
      `SELECT f.id, f.name, f.category, f.calories_per_100g, f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g, f.coach_id,
              CASE WHEN fav.coach_id IS NULL THEN 0 ELSE 1 END AS is_favorite
       FROM foods f
       LEFT JOIN food_favorites fav ON fav.food_id = f.id AND fav.coach_id = ?
       ${where}
       ORDER BY f.coach_id IS NOT NULL, f.name
       LIMIT 300`
    )
    .all(req.user.id, ...params);
  res.json({ foods });
});

router.get('/:id', requireAuth, requireRole('coach'), (req, res) => {
  const food = db
    .prepare(
      `SELECT f.id, f.name, f.category, f.calories_per_100g, f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g, f.coach_id,
              CASE WHEN fav.coach_id IS NULL THEN 0 ELSE 1 END AS is_favorite
       FROM foods f
       LEFT JOIN food_favorites fav ON fav.food_id = f.id AND fav.coach_id = ?
       WHERE f.id = ? AND (f.coach_id IS NULL OR f.coach_id = ?)`
    )
    .get(req.user.id, req.params.id, req.user.id);
  if (!food) return res.status(404).json({ error: 'الطعام غير موجود' });
  res.json({ food });
});

router.post('/', requireAuth, requireRole('coach'), (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM foods WHERE coach_id = ?').get(req.user.id).c;
  if (count >= MAX_CUSTOM_FOODS) return res.status(400).json({ error: 'وصلت للحد الأقصى من الأطعمة المخصصة' });
  const name = clampStr(req.body.name, 100).trim();
  if (!name) return res.status(400).json({ error: 'اكتب اسم الطعام' });
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : null;
  const info = db
    .prepare('INSERT INTO foods (coach_id, name, category, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, category, sanitizeMacro(req.body.calories), sanitizeMacro(req.body.protein), sanitizeMacro(req.body.carbs), sanitizeMacro(req.body.fat));
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.delete('/:id', requireAuth, requireRole('coach'), (req, res) => {
  const food = db.prepare('SELECT * FROM foods WHERE id = ?').get(req.params.id);
  if (!food || food.coach_id !== req.user.id) return res.status(404).json({ error: 'الطعام غير موجود' });
  db.prepare('DELETE FROM food_favorites WHERE food_id = ?').run(food.id);
  db.prepare('DELETE FROM foods WHERE id = ?').run(food.id);
  res.json({ ok: true });
});

router.post('/:id/favorite', requireAuth, requireRole('coach'), (req, res) => {
  const food = db.prepare('SELECT id, coach_id FROM foods WHERE id = ?').get(req.params.id);
  if (!food || (food.coach_id !== null && food.coach_id !== req.user.id)) return res.status(404).json({ error: 'الطعام غير موجود' });
  db.prepare('INSERT OR IGNORE INTO food_favorites (coach_id, food_id) VALUES (?, ?)').run(req.user.id, food.id);
  res.json({ ok: true });
});

router.delete('/:id/favorite', requireAuth, requireRole('coach'), (req, res) => {
  db.prepare('DELETE FROM food_favorites WHERE coach_id = ? AND food_id = ?').run(req.user.id, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
