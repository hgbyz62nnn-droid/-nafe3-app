const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const { sendBroadcastEmail } = require('../lib/email');

const router = express.Router();

const REPORT_REASONS = ['harassment', 'fraud', 'inappropriate', 'impersonation', 'other'];
const REPORT_ACTIONS = ['dismiss', 'warn', 'ban'];

// -------------------- الحظر --------------------

router.get('/status/:userId', requireAuth, (req, res) => {
  const targetId = Number(req.params.userId);
  const blockedByMe = !!db
    .prepare('SELECT 1 FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?')
    .get(req.user.id, targetId);
  const blockedMe = !!db
    .prepare('SELECT 1 FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?')
    .get(targetId, req.user.id);
  res.json({ blockedByMe, blockedMe });
});

router.get('/blocked', requireAuth, (req, res) => {
  const blocked = db
    .prepare(
      `SELECT u.id, u.name, u.avatar_path, u.role FROM blocked_users b
       JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = ? ORDER BY b.created_at DESC`
    )
    .all(req.user.id);
  res.json({ blocked });
});

router.post('/block/:userId', requireAuth, (req, res) => {
  const targetId = Number(req.params.userId);
  if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'طلب غير صحيح' });
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
  db.prepare('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)').run(req.user.id, targetId);
  res.json({ ok: true });
});

router.delete('/block/:userId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?').run(req.user.id, Number(req.params.userId));
  res.json({ ok: true });
});

// -------------------- البلاغات --------------------

router.post('/report/:userId', requireAuth, (req, res) => {
  const targetId = Number(req.params.userId);
  if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'طلب غير صحيح' });
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const reason = REPORT_REASONS.includes(req.body.reason) ? req.body.reason : null;
  if (!reason) return res.status(400).json({ error: 'اختار سبب البلاغ' });
  const details = String(req.body.details ?? '').trim().slice(0, 1000) || null;

  let subscriptionId = null;
  if (req.body.subscriptionId) {
    const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.body.subscriptionId);
    if (sub && (sub.trainee_id === req.user.id || sub.coach_id === req.user.id)) subscriptionId = sub.id;
  }

  db.prepare(
    'INSERT INTO user_reports (reporter_id, reported_id, subscription_id, reason, details) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, targetId, subscriptionId, reason, details);
  res.json({ ok: true });
});

// -------------------- الأدمن --------------------

router.get('/admin/reports', requireAdmin, (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.status && ['open', 'dismissed', 'action_taken'].includes(req.query.status)) {
    clauses.push('r.status = ?');
    params.push(req.query.status);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const reports = db
    .prepare(
      `SELECT r.*, reporter.name AS reporter_name, reporter.email AS reporter_email,
         reported.name AS reported_name, reported.email AS reported_email, reported.banned AS reported_banned
       FROM user_reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       JOIN users reported ON reported.id = r.reported_id
       ${where}
       ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.created_at DESC`
    )
    .all(...params);
  res.json({ reports });
});

router.post('/admin/reports/:id/action', requireAdmin, async (req, res) => {
  const report = db.prepare('SELECT * FROM user_reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'البلاغ غير موجود' });
  const action = REPORT_ACTIONS.includes(req.body.action) ? req.body.action : null;
  if (!action) return res.status(400).json({ error: 'إجراء غير صحيح' });

  if (action === 'ban') {
    db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(report.reported_id);
  } else if (action === 'warn') {
    const reported = db.prepare('SELECT email FROM users WHERE id = ?').get(report.reported_id);
    if (reported) {
      try {
        await sendBroadcastEmail(
          reported.email,
          'تحذير بخصوص استخدام حسابك على Traino',
          'وصلنا بلاغ عن سلوكك على المنصة، وبعد المراجعة قررنا إرسال تحذير لحسابك. الاستمرار في نفس السلوك ممكن يؤدي لحظر الحساب بالكامل.'
        );
      } catch (e) {
        console.log('فشل إرسال إيميل التحذير:', e.message);
      }
    }
  }

  const status = action === 'dismiss' ? 'dismissed' : 'action_taken';
  db.prepare('UPDATE user_reports SET status = ?, admin_action = ? WHERE id = ?').run(status, action, report.id);
  res.json({ ok: true });
});

module.exports = router;
