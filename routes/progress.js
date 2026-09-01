const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { uploadPhoto } = require('../lib/upload');
const { uploadsDir } = require('../lib/paths');
const { checkAndAwardBadges } = require('../lib/badges');

const router = express.Router();

router.get('/:subscriptionId', requireAuth, requireSubscriptionParty, (req, res) => {
  const entries = db
    .prepare('SELECT * FROM progress_entries WHERE subscription_id = ? ORDER BY created_at ASC')
    .all(req.sub.id);
  res.json({ entries });
});

router.post(
  '/:subscriptionId',
  requireAuth,
  requireSubscriptionParty,
  uploadPhoto.single('photo'),
  (req, res) => {
    if (req.isCoach) {
      if (req.file) fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
      return res.status(403).json({ error: 'المتدرب بس اللي يقدر يسجّل تقدمه' });
    }
    const weightKg = req.body.weight_kg && Number.isFinite(Number(req.body.weight_kg))
      ? Number(req.body.weight_kg)
      : null;
    const note = String(req.body.note ?? '').slice(0, 300);
    if (!weightKg && !req.file && !note) {
      return res.status(400).json({ error: 'محتاج توزن نفسك أو تضيف صورة أو ملاحظة' });
    }
    const photoPath = req.file ? req.file.filename : null;
    db.prepare(
      'INSERT INTO progress_entries (subscription_id, created_by, weight_kg, photo_path, note) VALUES (?, ?, ?, ?, ?)'
    ).run(req.sub.id, req.user.id, weightKg, photoPath, note || null);
    checkAndAwardBadges(req.sub.id);
    res.json({ ok: true });
  }
);

module.exports = router;
