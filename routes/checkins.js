const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { saveGalleryPhoto, deleteUploadedFile } = require('../lib/media');
const { clampStr, toNullableNumber, clampNumber } = require('../lib/sanitize');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const MEASUREMENT_FIELDS = ['waist', 'chest', 'hips', 'arm', 'thigh'];

function sanitizeMeasurements(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { obj = {}; }
  }
  if (!obj || typeof obj !== 'object') obj = {};
  const out = {};
  for (const key of MEASUREMENT_FIELDS) {
    out[key] = toNullableNumber(obj[key]);
  }
  return out;
}

function runUpload(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'حجم الصورة أكبر من 10 ميجا' });
    }
    if (err) return res.status(400).json({ error: 'حصل خطأ في رفع الصورة' });
    next();
  });
}

function serializeCheckin(row) {
  return { ...row, measurements: JSON.parse(row.measurements_json) };
}

router.get('/:subscriptionId', requireAuth, requireSubscriptionParty, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM check_ins WHERE subscription_id = ? ORDER BY created_at DESC')
    .all(req.sub.id);
  res.json({ checkIns: rows.map(serializeCheckin) });
});

router.post('/:subscriptionId', requireAuth, requireSubscriptionParty, runUpload, async (req, res) => {
  if (req.isCoach) return res.status(403).json({ error: 'المتدرب بس اللي يقدر يسجّل تقييم دوري' });

  const weightKg = toNullableNumber(req.body.weight_kg);
  const bodyFatPct = clampNumber(toNullableNumber(req.body.body_fat_pct), 0, 100);
  const measurements = sanitizeMeasurements(req.body.measurements);
  const energyLevel = clampNumber(toNullableNumber(req.body.energy_level), 1, 5);
  const sleepHours = clampNumber(toNullableNumber(req.body.sleep_hours), 0, 24);
  const trainingAdherencePct = clampNumber(toNullableNumber(req.body.training_adherence_pct), 0, 100);
  const dietAdherencePct = clampNumber(toNullableNumber(req.body.diet_adherence_pct), 0, 100);
  const traineeNotes = clampStr(req.body.trainee_notes, 500);

  let photoPath = null;
  if (req.file) {
    try {
      photoPath = await saveGalleryPhoto(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'حصل خطأ في رفع الصورة' });
    }
  }

  const info = db
    .prepare(
      `INSERT INTO check_ins
        (subscription_id, trainee_id, weight_kg, body_fat_pct, measurements_json, photo_path,
         energy_level, sleep_hours, training_adherence_pct, diet_adherence_pct, trainee_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.sub.id,
      req.user.id,
      weightKg,
      bodyFatPct,
      JSON.stringify(measurements),
      photoPath,
      energyLevel,
      sleepHours,
      trainingAdherencePct,
      dietAdherencePct,
      traineeNotes
    );

  const row = db.prepare('SELECT * FROM check_ins WHERE id = ?').get(info.lastInsertRowid);
  res.json({ ok: true, checkIn: serializeCheckin(row) });
});

router.post('/:subscriptionId/:id/review', requireAuth, requireSubscriptionParty, (req, res) => {
  if (!req.isCoach) return res.status(403).json({ error: 'الكوتش بس اللي يقدر يراجع التقييم الدوري' });
  const row = db.prepare('SELECT * FROM check_ins WHERE id = ? AND subscription_id = ?').get(req.params.id, req.sub.id);
  if (!row) return res.status(404).json({ error: 'التقييم غير موجود' });

  const coachNotes = clampStr(req.body.coach_notes, 500);
  db.prepare(
    "UPDATE check_ins SET coach_notes = ?, status = 'reviewed', reviewed_at = datetime('now') WHERE id = ?"
  ).run(coachNotes, row.id);

  const updated = db.prepare('SELECT * FROM check_ins WHERE id = ?').get(row.id);
  res.json({ ok: true, checkIn: serializeCheckin(updated) });
});

router.delete('/:subscriptionId/:id', requireAuth, requireSubscriptionParty, (req, res) => {
  const row = db.prepare('SELECT * FROM check_ins WHERE id = ? AND subscription_id = ?').get(req.params.id, req.sub.id);
  if (!row) return res.status(404).json({ error: 'التقييم غير موجود' });
  if (req.isCoach || row.trainee_id !== req.user.id) return res.status(403).json({ error: 'مش معاك صلاحية' });
  db.prepare('DELETE FROM check_ins WHERE id = ?').run(row.id);
  deleteUploadedFile(row.photo_path);
  res.json({ ok: true });
});

module.exports = router;
