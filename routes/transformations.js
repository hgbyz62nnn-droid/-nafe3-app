const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { saveGalleryPhoto, deleteUploadedFile } = require('../lib/media');
const { analyzeMessage, shouldBlock } = require('../lib/privacyFilter');
const { toNullableNumber } = require('../lib/sanitize');

const router = express.Router();
const VISIBILITY_VALUES = ['private', 'client_only', 'public'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function runUpload(req, res, next) {
  upload.fields([{ name: 'before', maxCount: 1 }, { name: 'after', maxCount: 1 }])(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'حجم الصورة أكبر من 5 ميجا' });
    }
    if (err) return res.status(400).json({ error: 'حصل خطأ في رفع الصور' });
    next();
  });
}

function checkFreeText(text, userId, subjectLabel) {
  if (!text) return { ok: true };
  const { flagged, reasons } = analyzeMessage(text);
  if (flagged) {
    db.prepare(
      'INSERT INTO flagged_attempts (user_id, subscription_id, message, reasons, blocked) VALUES (?, NULL, ?, ?, ?)'
    ).run(userId, `[${subjectLabel}] ${text}`, reasons.join(','), shouldBlock(reasons) ? 1 : 0);
    if (shouldBlock(reasons)) return { ok: false, error: 'النص فيه محتوى تواصل خارجي (رقم/لينك/يوزرنيم) مش مسموح بيه' };
  }
  return { ok: true };
}

// -------------------- ضمن علاقة اشتراك محددة --------------------

router.get('/:subscriptionId', requireAuth, requireSubscriptionParty, (req, res) => {
  // المتدرب مايشوفش صفوف 'private' (خاصة بالكوتش بس) - الكوتش يشوف كل حاجة.
  const rows = req.isCoach
    ? db.prepare('SELECT * FROM transformations WHERE subscription_id = ? ORDER BY created_at DESC').all(req.sub.id)
    : db.prepare("SELECT * FROM transformations WHERE subscription_id = ? AND visibility != 'private' ORDER BY created_at DESC").all(req.sub.id);
  res.json({ transformations: rows });
});

router.post('/:subscriptionId', requireAuth, requireSubscriptionParty, runUpload, async (req, res) => {
  if (!req.isCoach) return res.status(403).json({ error: 'الكوتش بس اللي يقدر يضيف تحول' });

  const beforeFile = req.files?.before?.[0];
  const afterFile = req.files?.after?.[0];
  if (!beforeFile || !afterFile) return res.status(400).json({ error: 'محتاج صورة "قبل" و"بعد" الاتنين' });

  const durationLabel = String(req.body.duration_label ?? '').trim().slice(0, 60);
  const goal = String(req.body.goal ?? '').trim().slice(0, 100);
  const notes = String(req.body.notes ?? '').trim().slice(0, 300);
  const testimonial = String(req.body.testimonial ?? '').trim().slice(0, 400);
  for (const [text, label] of [[goal, 'هدف تحول'], [notes, 'ملاحظات تحول'], [testimonial, 'شهادة عميل']]) {
    const check = checkFreeText(text, req.user.id, label);
    if (!check.ok) return res.status(422).json({ error: check.error });
  }
  const weightChange = toNullableNumber(req.body.weight_change);
  const bodyFatChange = toNullableNumber(req.body.body_fat_change);
  const visibility = VISIBILITY_VALUES.includes(req.body.visibility) ? req.body.visibility : 'client_only';
  // النشر العام مطلوب له موافقة صريحة من المتدرب - أبدًا مش تلقائي حتى لو
  // الكوتش طلبه من أول تحول، فبيتسجل 'pending' لحد ما المتدرب يوافق.
  const permissionStatus = visibility === 'public' ? 'pending' : 'not_requested';

  try {
    const [beforePath, afterPath] = await Promise.all([
      saveGalleryPhoto(beforeFile.buffer),
      saveGalleryPhoto(afterFile.buffer),
    ]);
    db.prepare(
      `INSERT INTO transformations
        (subscription_id, coach_id, trainee_id, before_photo_path, after_photo_path, duration_label, goal, notes, weight_change, body_fat_change, testimonial, visibility, permission_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.sub.id, req.sub.coach_id, req.sub.trainee_id, beforePath, afterPath,
      durationLabel || null, goal || null, notes || null, weightChange, bodyFatChange, testimonial || null,
      visibility, permissionStatus
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/:subscriptionId/:id', requireAuth, requireSubscriptionParty, (req, res) => {
  if (!req.isCoach) return res.status(403).json({ error: 'الكوتش بس اللي يقدر يعدّل' });
  const row = db.prepare('SELECT * FROM transformations WHERE id = ? AND subscription_id = ?').get(req.params.id, req.sub.id);
  if (!row) return res.status(404).json({ error: 'غير موجود' });
  if (req.body.visibility !== undefined) {
    if (!VISIBILITY_VALUES.includes(req.body.visibility)) return res.status(400).json({ error: 'قيمة غير صحيحة' });
    // لو الكوتش طالب النشر العام وسبق المتدرب رفضه أو محدش سأله لسه،
    // برجّعها 'pending' - أي موافقة سابقة (granted) بتفضل زي ما هي عشان
    // مانضايقش المتدرب بنفس السؤال كل مرة الكوتش يبدّل الحالة ويرجّعها.
    const permissionStatus = req.body.visibility === 'public' && row.permission_status !== 'granted' ? 'pending' : row.permission_status;
    db.prepare('UPDATE transformations SET visibility = ?, permission_status = ? WHERE id = ?').run(req.body.visibility, permissionStatus, row.id);
  }
  res.json({ ok: true });
});

// موافقة/رفض المتدرب على النشر العام - حق المتدرب بس، في أي وقت (حتى لو
// كان وافق قبل كده، يقدر يسحب الموافقة).
router.post('/:subscriptionId/:id/permission', requireAuth, requireSubscriptionParty, (req, res) => {
  if (req.isCoach) return res.status(403).json({ error: 'المتدرب بس اللي يقدر يوافق أو يرفض' });
  const row = db.prepare('SELECT * FROM transformations WHERE id = ? AND subscription_id = ?').get(req.params.id, req.sub.id);
  if (!row) return res.status(404).json({ error: 'غير موجود' });
  const decision = ['granted', 'declined'].includes(req.body.decision) ? req.body.decision : null;
  if (!decision) return res.status(400).json({ error: 'قيمة غير صحيحة' });
  db.prepare('UPDATE transformations SET permission_status = ? WHERE id = ?').run(decision, row.id);
  res.json({ ok: true });
});

router.delete('/:subscriptionId/:id', requireAuth, requireSubscriptionParty, (req, res) => {
  if (!req.isCoach) return res.status(403).json({ error: 'الكوتش بس اللي يقدر يحذف' });
  const row = db.prepare('SELECT * FROM transformations WHERE id = ? AND subscription_id = ?').get(req.params.id, req.sub.id);
  if (!row) return res.status(404).json({ error: 'غير موجود' });
  db.prepare('DELETE FROM transformations WHERE id = ?').run(row.id);
  deleteUploadedFile(row.before_photo_path);
  deleteUploadedFile(row.after_photo_path);
  res.json({ ok: true });
});

// -------------------- عامة لكل عملاء الكوتش --------------------

// عامة تمامًا (زي البروفايل العام) - بترجع بس التحولات العامة لكوتش معين.
router.get('/coach/:coachId', (req, res) => {
  // النشر العام يتطلب visibility='public' وموافقة صريحة من المتدرب
  // (permission_status='granted') الاتنين مع بعض - مفيش نشر تلقائي.
  const rows = db
    .prepare(
      `SELECT t.*, u.name AS trainee_name FROM transformations t
       JOIN users u ON u.id = t.trainee_id
       WHERE t.coach_id = ? AND t.visibility = 'public' AND t.permission_status = 'granted'
       ORDER BY t.created_at DESC`
    )
    .all(req.params.coachId);
  res.json({ transformations: rows });
});

// كل تحولات متدربين الكوتش الحالي (عامة وخاصة) - للوحته الخاصة بس.
router.get('/', requireAuth, (req, res) => {
  if (req.user.role !== 'coach') return res.status(403).json({ error: 'الكوتش بس' });
  const rows = db
    .prepare(
      `SELECT t.*, u.name AS trainee_name FROM transformations t
       JOIN users u ON u.id = t.trainee_id
       WHERE t.coach_id = ? ORDER BY t.created_at DESC`
    )
    .all(req.user.id);
  res.json({ transformations: rows });
});

module.exports = router;
