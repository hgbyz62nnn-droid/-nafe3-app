const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { clampStr, toNullableNumber } = require('../lib/sanitize');

const router = express.Router();

const MUSCLE_GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio'];
const EQUIPMENT_TYPES = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bands', 'kettlebell'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const EXERCISE_KINDS = ['compound', 'isolation', 'unilateral', 'bilateral'];
const MOVEMENT_PATTERNS = ['push', 'pull', 'squat', 'hinge', 'lunge', 'carry', 'rotation', 'anti_rotation', 'flexion', 'extension'];
const MAX_CUSTOM_EXERCISES = 200;

// المكتبة كلها للكوتش بس - المتدرب بيشوف اسم التمرين جاهز في خطته، مش
// محتاج يدور في المكتبة نفسها.
router.get('/', requireAuth, requireRole('coach'), (req, res) => {
  const scope = ['all', 'favorites', 'mine'].includes(req.query.scope) ? req.query.scope : 'all';
  const clauses = [];
  const params = [];

  if (scope === 'mine') {
    clauses.push('e.coach_id = ?');
    params.push(req.user.id);
  } else {
    clauses.push('(e.coach_id IS NULL OR e.coach_id = ?)');
    params.push(req.user.id);
  }
  if (scope === 'favorites') {
    clauses.push('f.coach_id IS NOT NULL');
  }
  if (req.query.search) {
    clauses.push('e.name LIKE ?');
    params.push('%' + String(req.query.search).slice(0, 60) + '%');
  }
  if (MUSCLE_GROUPS.includes(req.query.muscleGroup)) {
    clauses.push('e.muscle_group = ?');
    params.push(req.query.muscleGroup);
  }
  if (EQUIPMENT_TYPES.includes(req.query.equipment)) {
    clauses.push('e.equipment = ?');
    params.push(req.query.equipment);
  }
  if (DIFFICULTIES.includes(req.query.difficulty)) {
    clauses.push('e.difficulty = ?');
    params.push(req.query.difficulty);
  }
  if (EXERCISE_KINDS.includes(req.query.exerciseType)) {
    clauses.push('e.exercise_type = ?');
    params.push(req.query.exerciseType);
  }
  if (MOVEMENT_PATTERNS.includes(req.query.movementPattern)) {
    clauses.push('e.movement_pattern = ?');
    params.push(req.query.movementPattern);
  }
  // لتبديل التمرين (Swap Exercise) - استبعاد التمرين الحالي نفسه من نتايج
  // "تمارين مشابهة" عشان مايظهرش كاقتراح لتبديل نفسه.
  const excludeId = toNullableNumber(req.query.excludeId);
  if (excludeId !== null) {
    clauses.push('e.id != ?');
    params.push(excludeId);
  }

  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const exercises = db
    .prepare(
      `SELECT e.id, e.name, e.muscle_group, e.equipment, e.difficulty, e.exercise_type, e.movement_pattern, e.video_url, e.coach_id,
              CASE WHEN f.coach_id IS NULL THEN 0 ELSE 1 END AS is_favorite
       FROM exercises e
       LEFT JOIN exercise_favorites f ON f.exercise_id = e.id AND f.coach_id = ?
       ${where}
       ORDER BY e.coach_id IS NOT NULL, e.name
       LIMIT 300`
    )
    .all(req.user.id, ...params);
  res.json({ exercises });
});

// التفاصيل الكاملة لتمرين واحد - مستخدمة في شاشة Exercise Detail وفي
// تبديل التمرين (بنجيب معايير التمرين الحالي الأول عشان نلاقي شبهه).
router.get('/:id', requireAuth, requireRole('coach'), (req, res) => {
  const ex = db
    .prepare(
      `SELECT e.*, CASE WHEN f.coach_id IS NULL THEN 0 ELSE 1 END AS is_favorite
       FROM exercises e LEFT JOIN exercise_favorites f ON f.exercise_id = e.id AND f.coach_id = ?
       WHERE e.id = ? AND (e.coach_id IS NULL OR e.coach_id = ?)`
    )
    .get(req.user.id, req.params.id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'التمرين غير موجود' });
  res.json({ exercise: ex });
});

router.post('/', requireAuth, requireRole('coach'), (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM exercises WHERE coach_id = ?').get(req.user.id).c;
  if (count >= MAX_CUSTOM_EXERCISES) return res.status(400).json({ error: 'وصلت للحد الأقصى من التمارين المخصصة' });
  const name = clampStr(req.body.name, 100).trim();
  if (!name) return res.status(400).json({ error: 'اكتب اسم التمرين' });
  const muscleGroup = MUSCLE_GROUPS.includes(req.body.muscleGroup) ? req.body.muscleGroup : null;
  const equipment = EQUIPMENT_TYPES.includes(req.body.equipment) ? req.body.equipment : null;
  const difficulty = DIFFICULTIES.includes(req.body.difficulty) ? req.body.difficulty : null;
  const exerciseType = EXERCISE_KINDS.includes(req.body.exerciseType) ? req.body.exerciseType : null;
  const movementPattern = MOVEMENT_PATTERNS.includes(req.body.movementPattern) ? req.body.movementPattern : null;
  const videoUrl = clampStr(req.body.videoUrl, 300);
  const instructions = clampStr(req.body.instructions, 500);
  const secondaryMuscles = Array.isArray(req.body.secondaryMuscles)
    ? req.body.secondaryMuscles.filter((m) => MUSCLE_GROUPS.includes(m) && m !== muscleGroup).slice(0, 6)
    : [];
  const info = db
    .prepare('INSERT INTO exercises (coach_id, name, muscle_group, equipment, difficulty, exercise_type, movement_pattern, video_url, instructions, secondary_muscles) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, muscleGroup, equipment, difficulty, exerciseType, movementPattern, videoUrl || null, instructions || null, JSON.stringify(secondaryMuscles));
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.delete('/:id', requireAuth, requireRole('coach'), (req, res) => {
  const ex = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!ex || ex.coach_id !== req.user.id) return res.status(404).json({ error: 'التمرين غير موجود' });
  db.prepare('DELETE FROM exercise_favorites WHERE exercise_id = ?').run(ex.id);
  db.prepare('DELETE FROM exercises WHERE id = ?').run(ex.id);
  res.json({ ok: true });
});

router.post('/:id/favorite', requireAuth, requireRole('coach'), (req, res) => {
  const ex = db.prepare('SELECT id, coach_id FROM exercises WHERE id = ?').get(req.params.id);
  if (!ex || (ex.coach_id !== null && ex.coach_id !== req.user.id)) return res.status(404).json({ error: 'التمرين غير موجود' });
  db.prepare('INSERT OR IGNORE INTO exercise_favorites (coach_id, exercise_id) VALUES (?, ?)').run(req.user.id, ex.id);
  res.json({ ok: true });
});

router.delete('/:id/favorite', requireAuth, requireRole('coach'), (req, res) => {
  db.prepare('DELETE FROM exercise_favorites WHERE coach_id = ? AND exercise_id = ?').run(req.user.id, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
