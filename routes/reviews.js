const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/adminAuth');
const { logAudit } = require('../lib/auditLog');

const router = express.Router();

// زي middleware/subscriptionAccess.js بس بيسمح كمان بعد ما الاشتراك يخلص
// (expired)، عشان التقييم غالبًا بييجي بعد ما العلاقة تخلص مش وهي شغالة.
function requireReviewableSubscription(req, res, next) {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.subscriptionId);
  if (!sub) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  if (sub.trainee_id !== req.user.id && sub.coach_id !== req.user.id) {
    return res.status(403).json({ error: 'مش معاك صلاحية' });
  }
  if (!['active', 'expired'].includes(sub.status)) return res.status(403).json({ error: 'الاشتراك غير متاح للتقييم' });
  req.sub = sub;
  req.isCoach = sub.coach_id === req.user.id;
  next();
}

router.get('/coach/:coachId', (req, res) => {
  const reviews = db
    .prepare(
      `SELECT r.rating, r.comment, r.coach_response, r.created_at, t.name AS trainee_name
       FROM reviews r JOIN users t ON t.id = r.trainee_id
       WHERE r.coach_id = ? AND r.hidden = 0 ORDER BY r.created_at DESC`
    )
    .all(req.params.coachId);
  res.json({ reviews });
});

router.get('/:subscriptionId/mine', requireAuth, requireReviewableSubscription, (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE subscription_id = ?').get(req.sub.id);
  res.json({ review: review || null });
});

router.post('/:subscriptionId', requireAuth, requireReviewableSubscription, (req, res) => {
  if (req.isCoach) return res.status(403).json({ error: 'المتدرب بس اللي يقدر يقيّم' });

  const { c } = db
    .prepare("SELECT COUNT(*) AS c FROM booked_sessions WHERE subscription_id = ? AND status = 'completed'")
    .get(req.sub.id);
  if (c === 0) return res.status(403).json({ error: 'التقييم بيبقى متاح بعد أول جلسة مكتملة' });

  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'التقييم لازم يكون من 1 لـ 5' });
  const comment = String(req.body.comment ?? '').trim().slice(0, 500);

  const existing = db.prepare('SELECT id FROM reviews WHERE subscription_id = ?').get(req.sub.id);
  if (existing) {
    db.prepare('UPDATE reviews SET rating = ?, comment = ? WHERE id = ?').run(rating, comment, existing.id);
  } else {
    db.prepare(
      'INSERT INTO reviews (subscription_id, coach_id, trainee_id, rating, comment) VALUES (?, ?, ?, ?, ?)'
    ).run(req.sub.id, req.sub.coach_id, req.sub.trainee_id, rating, comment);
  }
  res.json({ ok: true });
});

router.post('/:subscriptionId/response', requireAuth, requireReviewableSubscription, (req, res) => {
  if (!req.isCoach) return res.status(403).json({ error: 'الكوتش بس اللي يقدر يرد' });
  const review = db.prepare('SELECT id FROM reviews WHERE subscription_id = ?').get(req.sub.id);
  if (!review) return res.status(404).json({ error: 'مفيش تقييم للاشتراك ده لسه' });
  const response = String(req.body.response ?? '').trim().slice(0, 500);
  db.prepare('UPDATE reviews SET coach_response = ? WHERE id = ?').run(response || null, review.id);
  res.json({ ok: true });
});

// كوتش بس (صاحب التقييم اللي اتكتب عنه) يقدر يبلّغ عن تقييم بيشوفه مسيء أو
// غير حقيقي، عشان الأدمن يراجعه. مش نفس user_reports (اللي بيبلّغ عن يوزر
// بشكل عام) لأن ده مربوط بتقييم واحد بعينه.
router.post('/:id/report', requireAuth, (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: 'التقييم غير موجود' });
  if (review.coach_id !== req.user.id) return res.status(403).json({ error: 'الكوتش صاحب التقييم بس اللي يقدر يبلّغ عنه' });

  const existing = db.prepare("SELECT id FROM review_reports WHERE review_id = ? AND reporter_id = ? AND status = 'open'").get(review.id, req.user.id);
  if (existing) return res.status(400).json({ error: 'أنت بلّغت عن التقييم ده بالفعل وبلاغك لسه قيد المراجعة' });

  const reason = String(req.body.reason ?? '').trim().slice(0, 500) || null;
  db.prepare('INSERT INTO review_reports (review_id, reporter_id, reason) VALUES (?, ?, ?)').run(review.id, req.user.id, reason);
  res.json({ ok: true });
});

router.get('/admin/all', requireAdmin, requirePermission('reviews', 'view'), (req, res) => {
  const reviews = db
    .prepare(
      `SELECT r.*, t.name AS trainee_name, c.name AS coach_name
       FROM reviews r JOIN users t ON t.id = r.trainee_id JOIN users c ON c.id = r.coach_id
       ORDER BY r.created_at DESC`
    )
    .all();
  res.json({ reviews });
});

router.post('/admin/:id/hide', requireAdmin, requirePermission('reviews', 'edit'), (req, res) => {
  db.prepare('UPDATE reviews SET hidden = 1 WHERE id = ?').run(req.params.id);
  logAudit(db, { adminId: req.admin.id, adminUsername: req.admin.username, action: 'hide_review', resourceType: 'reviews', resourceId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

router.post('/admin/:id/restore', requireAdmin, requirePermission('reviews', 'edit'), (req, res) => {
  db.prepare('UPDATE reviews SET hidden = 0 WHERE id = ?').run(req.params.id);
  logAudit(db, { adminId: req.admin.id, adminUsername: req.admin.username, action: 'restore_review', resourceType: 'reviews', resourceId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

// -------------------- بلاغات على التقييمات --------------------

router.get('/admin/reports', requireAdmin, requirePermission('reviews', 'view'), (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.status && ['open', 'dismissed', 'action_taken'].includes(req.query.status)) {
    clauses.push('rr.status = ?');
    params.push(req.query.status);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const reports = db
    .prepare(
      `SELECT rr.*, r.rating, r.comment, r.hidden AS review_hidden,
         reporter.name AS reporter_name, t.name AS trainee_name
       FROM review_reports rr
       JOIN reviews r ON r.id = rr.review_id
       JOIN users reporter ON reporter.id = rr.reporter_id
       JOIN users t ON t.id = r.trainee_id
       ${where}
       ORDER BY CASE rr.status WHEN 'open' THEN 0 ELSE 1 END, rr.created_at DESC`
    )
    .all(...params);
  res.json({ reports });
});

router.post('/admin/reports/:id/action', requireAdmin, requirePermission('reviews', 'edit'), (req, res) => {
  const report = db.prepare('SELECT * FROM review_reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'البلاغ غير موجود' });
  const action = ['dismiss', 'hide'].includes(req.body.action) ? req.body.action : null;
  if (!action) return res.status(400).json({ error: 'إجراء غير صحيح' });

  if (action === 'hide') {
    db.prepare('UPDATE reviews SET hidden = 1 WHERE id = ?').run(report.review_id);
  }
  const status = action === 'dismiss' ? 'dismissed' : 'action_taken';
  db.prepare('UPDATE review_reports SET status = ?, admin_action = ? WHERE id = ?').run(status, action, report.id);
  logAudit(db, { adminId: req.admin.id, adminUsername: req.admin.username, action: `review_report_${action}`, resourceType: 'reviews', resourceId: report.review_id, metadata: { reportId: report.id }, ip: req.ip });
  res.json({ ok: true });
});

module.exports = router;
