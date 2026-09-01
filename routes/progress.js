const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { saveGalleryPhoto } = require('../lib/media');
const { toNullableNumber } = require('../lib/sanitize');
const { checkAndAwardBadges } = require('../lib/badges');

const router = express.Router();

// نفس نمط الرفع المستخدم في checkins/transformations/trainerDocuments -
// الملف بيتخزن في الذاكرة الأول، وsaveGalleryPhoto() بتتأكد من نوعه
// الحقيقي بقراءة الـ magic bytes الفعلية (مش الامتداد أو الـ mimetype
// اللي العميل بعته) قبل ما يتكتب على الـ disk خالص. الشكل القديم هنا
// (lib/upload.js) كان بيكتب الملف على الـ disk مباشرة ويفلتر بس على
// أساس file.mimetype المُدّعى، وده سهل التزوير.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function runUpload(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'حجم الصورة أكبر من 8 ميجا' });
    }
    if (err) return res.status(400).json({ error: 'حصل خطأ في رفع الصورة' });
    next();
  });
}

router.get('/:subscriptionId', requireAuth, requireSubscriptionParty, (req, res) => {
  const entries = db
    .prepare('SELECT * FROM progress_entries WHERE subscription_id = ? ORDER BY created_at ASC')
    .all(req.sub.id);
  res.json({ entries });
});

router.post('/:subscriptionId', requireAuth, requireSubscriptionParty, runUpload, async (req, res) => {
  if (req.isCoach) {
    // الملف لسه في الذاكرة بس (multer.memoryStorage) - لو رُفض هنا مفيش
    // حاجة كتبت على الـ disk أصلًا، عكس النسخة القديمة اللي كانت لازم
    // تمسح الملف بعد ما تكون كتبته.
    return res.status(403).json({ error: 'المتدرب بس اللي يقدر يسجّل تقدمه' });
  }
  const weightKg = toNullableNumber(req.body.weight_kg);
  const note = String(req.body.note ?? '').slice(0, 300);
  if (weightKg === null && !req.file && !note) {
    return res.status(400).json({ error: 'محتاج توزن نفسك أو تضيف صورة أو ملاحظة' });
  }

  let photoPath = null;
  if (req.file) {
    try {
      photoPath = await saveGalleryPhoto(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'حصل خطأ في رفع الصورة' });
    }
  }

  db.prepare(
    'INSERT INTO progress_entries (subscription_id, created_by, weight_kg, photo_path, note) VALUES (?, ?, ?, ?, ?)'
  ).run(req.sub.id, req.user.id, weightKg, photoPath, note || null);
  checkAndAwardBadges(req.sub.id);
  res.json({ ok: true });
});

module.exports = router;
