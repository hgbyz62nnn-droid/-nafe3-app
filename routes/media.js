const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { saveAvatar, saveGalleryPhoto, deleteUploadedFile } = require('../lib/media');
const { analyzeMessage, shouldBlock } = require('../lib/privacyFilter');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const MAX_GALLERY_PHOTOS = 20;
const MAX_BIO_LENGTH = 300;

// زي requireAuth بس من غير ما يرفض الطلب لو مفيش تسجيل دخول - مستخدم في
// عرض الجاليري العامة اللي أي حد يقدر يشوفها، بس المالك يشوف صوره الخاصة كمان.
function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) { req.user = null; return next(); }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, role, name, banned FROM users WHERE id = ?').get(decoded.id);
    req.user = user && !user.banned ? { id: user.id, role: user.role, name: user.name } : null;
  } catch {
    req.user = null;
  }
  next();
}

// عشان رسائل الخطأ من multer (زي حجم الملف) ومن sharp تطلع بنفس شكل
// أخطاء الـ API العادية بدل ما express يرميها كـ error صفحة كاملة.
function runUpload(field) {
  const mw = upload.single(field);
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'حجم الصورة أكبر من 5 ميجا' });
      }
      if (err) return res.status(400).json({ error: 'حصل خطأ في رفع الصورة' });
      next();
    });
  };
}

function checkCaptionOrBio(text, userId, subjectLabel) {
  if (!text) return { ok: true, clean: null };
  const { flagged, reasons } = analyzeMessage(text);
  if (flagged) {
    db.prepare(
      'INSERT INTO flagged_attempts (user_id, subscription_id, message, reasons, blocked) VALUES (?, NULL, ?, ?, ?)'
    ).run(userId, `[${subjectLabel}] ${text}`, reasons.join(','), shouldBlock(reasons) ? 1 : 0);
    if (shouldBlock(reasons)) {
      return { ok: false, error: 'النص فيه محتوى تواصل خارجي (رقم/لينك/يوزرنيم) مش مسموح بيه' };
    }
  }
  return { ok: true, clean: text };
}

// -------------------- صورة البروفايل --------------------

router.post('/avatar', requireAuth, runUpload('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'اختار صورة' });
  try {
    const filename = await saveAvatar(req.file.buffer);
    const old = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(req.user.id);
    db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(filename, req.user.id);
    if (old && old.avatar_path) deleteUploadedFile(old.avatar_path);
    res.json({ ok: true, avatarPath: filename });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/avatar', requireAuth, (req, res) => {
  const old = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(req.user.id);
  db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?').run(req.user.id);
  if (old && old.avatar_path) deleteUploadedFile(old.avatar_path);
  res.json({ ok: true });
});

// -------------------- البايو --------------------

router.put('/bio', requireAuth, (req, res) => {
  const bio = String(req.body.bio ?? '').trim().slice(0, MAX_BIO_LENGTH);
  const check = checkCaptionOrBio(bio, req.user.id, 'بايو');
  if (!check.ok) return res.status(422).json({ error: check.error });
  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio || null, req.user.id);
  res.json({ ok: true });
});

// -------------------- الجاليري --------------------

router.get('/gallery/:userId', optionalAuth, (req, res) => {
  const isOwner = req.user && req.user.id === Number(req.params.userId);
  const photos = isOwner
    ? db.prepare('SELECT * FROM gallery_photos WHERE user_id = ? ORDER BY created_at DESC').all(req.params.userId)
    : db.prepare("SELECT * FROM gallery_photos WHERE user_id = ? AND visibility = 'public' ORDER BY created_at DESC").all(req.params.userId);
  res.json({ photos });
});

router.post('/gallery', requireAuth, runUpload('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'اختار صورة' });

  const { c } = db.prepare('SELECT COUNT(*) AS c FROM gallery_photos WHERE user_id = ?').get(req.user.id);
  if (c >= MAX_GALLERY_PHOTOS) return res.status(400).json({ error: `أقصى عدد صور في الجاليري ${MAX_GALLERY_PHOTOS}` });

  const caption = String(req.body.caption ?? '').trim().slice(0, 200);
  const check = checkCaptionOrBio(caption, req.user.id, 'كابشن صورة');
  if (!check.ok) return res.status(422).json({ error: check.error });

  const visibility = req.body.visibility === 'private' ? 'private' : 'public';

  try {
    const filename = await saveGalleryPhoto(req.file.buffer);
    db.prepare(
      'INSERT INTO gallery_photos (user_id, photo_path, caption, visibility) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, filename, caption || null, visibility);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/gallery/:id', requireAuth, (req, res) => {
  const photo = db.prepare('SELECT * FROM gallery_photos WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!photo) return res.status(404).json({ error: 'الصورة غير موجودة' });

  const updates = [];
  const params = [];
  if (req.body.visibility !== undefined) {
    if (!['public', 'private'].includes(req.body.visibility)) return res.status(400).json({ error: 'قيمة خصوصية غير صحيحة' });
    updates.push('visibility = ?'); params.push(req.body.visibility);
  }
  if (req.body.caption !== undefined) {
    const caption = String(req.body.caption).trim().slice(0, 200);
    const check = checkCaptionOrBio(caption, req.user.id, 'كابشن صورة');
    if (!check.ok) return res.status(422).json({ error: check.error });
    updates.push('caption = ?'); params.push(caption || null);
  }
  if (!updates.length) return res.status(400).json({ error: 'مفيش حاجة للتحديث' });
  params.push(photo.id);
  db.prepare(`UPDATE gallery_photos SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

router.delete('/gallery/:id', requireAuth, (req, res) => {
  const photo = db.prepare('SELECT * FROM gallery_photos WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!photo) return res.status(404).json({ error: 'الصورة غير موجودة' });
  db.prepare('DELETE FROM gallery_photos WHERE id = ?').run(photo.id);
  deleteUploadedFile(photo.photo_path);
  res.json({ ok: true });
});

module.exports = router;
