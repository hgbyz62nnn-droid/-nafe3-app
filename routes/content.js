const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/adminAuth');
const { logAudit } = require('../lib/auditLog');
const { saveGalleryPhoto, deleteUploadedFile } = require('../lib/media');
const { analyzeMessage, shouldBlock } = require('../lib/privacyFilter');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const CATEGORIES = ['tip', 'educational', 'exercise', 'transformation', 'motivation', 'announcement'];
const MAX_CONTENT_LEN = 1000;
const MAX_POSTS_PER_COACH = 500;

function runUpload(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'حجم الصورة أكبر من 5 ميجا' });
    if (err) return res.status(400).json({ error: 'حصل خطأ في رفع الصورة' });
    next();
  });
}

const POST_SELECT_FIELDS = `
  p.id, p.coach_id, p.category, p.content, p.photo_path, p.created_at,
  u.name AS coach_name, u.avatar_path AS coach_avatar, u.verified AS coach_verified,
  c.specialty AS coach_specialty,
  (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) AS like_count,
  (SELECT COUNT(*) FROM post_saves WHERE post_id = p.id) AS save_count
`;

function serializePost(p, viewerId) {
  return {
    ...p,
    is_liked: !!db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(p.id, viewerId),
    is_saved: !!db.prepare('SELECT 1 FROM post_saves WHERE post_id = ? AND user_id = ?').get(p.id, viewerId),
  };
}

// -------------------- نشر المدرب --------------------

router.post('/', requireAuth, requireRole('coach'), runUpload, async (req, res) => {
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : null;
  if (!category) return res.status(400).json({ error: 'اختار نوع المنشور' });
  const content = String(req.body.content ?? '').trim().slice(0, MAX_CONTENT_LEN);
  if (!content) return res.status(400).json({ error: 'اكتب محتوى المنشور' });

  const { flagged, reasons } = analyzeMessage(content);
  if (flagged) {
    db.prepare('INSERT INTO flagged_attempts (user_id, subscription_id, message, reasons, blocked) VALUES (?, NULL, ?, ?, ?)')
      .run(req.user.id, `[منشور مدرب] ${content}`, reasons.join(','), shouldBlock(reasons) ? 1 : 0);
    if (shouldBlock(reasons)) return res.status(422).json({ error: 'النص فيه محتوى تواصل خارجي (رقم/لينك/يوزرنيم) مش مسموح بيه' });
  }

  const count = db.prepare('SELECT COUNT(*) c FROM trainer_posts WHERE coach_id = ?').get(req.user.id).c;
  if (count >= MAX_POSTS_PER_COACH) return res.status(400).json({ error: 'وصلت للحد الأقصى من المنشورات' });

  let photoPath = null;
  if (req.file) {
    try {
      photoPath = await saveGalleryPhoto(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'حصل خطأ في رفع الصورة' });
    }
  }

  const info = db.prepare('INSERT INTO trainer_posts (coach_id, category, content, photo_path) VALUES (?, ?, ?, ?)').run(req.user.id, category, content, photoPath);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.get('/mine', requireAuth, requireRole('coach'), (req, res) => {
  const posts = db
    .prepare(
      `SELECT id, category, content, photo_path, created_at,
         (SELECT COUNT(*) FROM post_likes WHERE post_id = trainer_posts.id) AS like_count,
         (SELECT COUNT(*) FROM post_saves WHERE post_id = trainer_posts.id) AS save_count
       FROM trainer_posts WHERE coach_id = ? ORDER BY created_at DESC`
    )
    .all(req.user.id);
  res.json({ posts });
});

router.delete('/:id', requireAuth, requireRole('coach'), (req, res) => {
  const post = db.prepare('SELECT * FROM trainer_posts WHERE id = ?').get(req.params.id);
  if (!post || post.coach_id !== req.user.id) return res.status(404).json({ error: 'المنشور غير موجود' });
  db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(post.id);
  db.prepare('DELETE FROM post_saves WHERE post_id = ?').run(post.id);
  db.prepare('DELETE FROM trainer_posts WHERE id = ?').run(post.id);
  deleteUploadedFile(post.photo_path);
  res.json({ ok: true });
});

// -------------------- الفيد العام --------------------

router.get('/', requireAuth, (req, res) => {
  const posts = db
    .prepare(
      `SELECT ${POST_SELECT_FIELDS}
       FROM trainer_posts p
       JOIN users u ON u.id = p.coach_id
       JOIN coach_profiles c ON c.user_id = p.coach_id
       WHERE p.hidden = 0 AND c.status = 'approved'
         AND p.coach_id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = ?)
         AND p.coach_id NOT IN (SELECT blocker_id FROM blocked_users WHERE blocked_id = ?)
       ORDER BY p.created_at DESC
       LIMIT 50`
    )
    .all(req.user.id, req.user.id);
  res.json({ posts: posts.map((p) => serializePost(p, req.user.id)) });
});

router.get('/saved', requireAuth, (req, res) => {
  const posts = db
    .prepare(
      `SELECT ${POST_SELECT_FIELDS}
       FROM post_saves s
       JOIN trainer_posts p ON p.id = s.post_id
       JOIN users u ON u.id = p.coach_id
       JOIN coach_profiles c ON c.user_id = p.coach_id
       WHERE s.user_id = ? AND p.hidden = 0
       ORDER BY s.created_at DESC`
    )
    .all(req.user.id);
  res.json({ posts: posts.map((p) => serializePost(p, req.user.id)) });
});

router.post('/:id/like', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM trainer_posts WHERE id = ? AND hidden = 0').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'المنشور غير موجود' });
  db.prepare('INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)').run(post.id, req.user.id);
  res.json({ ok: true });
});

router.delete('/:id/like', requireAuth, (req, res) => {
  db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/:id/save', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM trainer_posts WHERE id = ? AND hidden = 0').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'المنشور غير موجود' });
  db.prepare('INSERT OR IGNORE INTO post_saves (post_id, user_id) VALUES (?, ?)').run(post.id, req.user.id);
  res.json({ ok: true });
});

router.delete('/:id/save', requireAuth, (req, res) => {
  db.prepare('DELETE FROM post_saves WHERE post_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// -------------------- الأدمن --------------------

router.get('/admin/all', requireAdmin, requirePermission('content', 'view'), (req, res) => {
  const posts = db
    .prepare(
      `SELECT p.*, u.name AS coach_name, u.email AS coach_email
       FROM trainer_posts p JOIN users u ON u.id = p.coach_id
       ORDER BY p.created_at DESC LIMIT 300`
    )
    .all();
  res.json({ posts });
});

router.post('/admin/:id/hide', requireAdmin, requirePermission('content', 'edit'), (req, res) => {
  db.prepare('UPDATE trainer_posts SET hidden = 1 WHERE id = ?').run(req.params.id);
  logAudit(db, { adminId: req.admin.id, adminUsername: req.admin.username, action: 'hide_content', resourceType: 'content', resourceId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

router.post('/admin/:id/restore', requireAdmin, requirePermission('content', 'edit'), (req, res) => {
  db.prepare('UPDATE trainer_posts SET hidden = 0 WHERE id = ?').run(req.params.id);
  logAudit(db, { adminId: req.admin.id, adminUsername: req.admin.username, action: 'restore_content', resourceType: 'content', resourceId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

module.exports = router;
