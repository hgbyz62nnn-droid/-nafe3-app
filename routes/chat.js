const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/adminAuth');
const { analyzeWithHistory, shouldBlock } = require('../lib/privacyFilter');

const router = express.Router();

function assertParticipant(sub, userId) {
  return sub && (sub.trainee_id === userId || sub.coach_id === userId);
}

router.get('/:subscriptionId', requireAuth, (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.subscriptionId);
  if (!assertParticipant(sub, req.user.id)) return res.status(403).json({ error: 'مش معاك صلاحية' });
  if (sub.status !== 'active') return res.status(403).json({ error: 'الشات بيتفعّل بعد تأكيد الاشتراك' });

  const messages = db
    .prepare('SELECT * FROM messages WHERE subscription_id = ? ORDER BY id ASC')
    .all(req.params.subscriptionId);

  const seenCol = req.user.id === sub.trainee_id ? 'trainee_last_seen_at' : 'coach_last_seen_at';
  db.prepare(`UPDATE subscriptions SET ${seenCol} = datetime('now') WHERE id = ?`).run(sub.id);

  res.json({ messages });
});

router.post('/:subscriptionId', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'اكتب رسالة الأول' });

  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.subscriptionId);
  if (!assertParticipant(sub, req.user.id)) return res.status(403).json({ error: 'مش معاك صلاحية' });
  if (sub.status !== 'active') return res.status(403).json({ error: 'الشات بيتفعّل بعد تأكيد الاشتراك' });

  const otherId = req.user.id === sub.trainee_id ? sub.coach_id : sub.trainee_id;
  const isUserBlocked = db
    .prepare(
      `SELECT 1 FROM blocked_users
       WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`
    )
    .get(req.user.id, otherId, otherId, req.user.id);
  if (isUserBlocked) return res.status(403).json({ error: 'الشات متوقف بسبب الحظر بين الطرفين' });

  const recent = db
    .prepare('SELECT content FROM messages WHERE subscription_id = ? AND sender_id = ? ORDER BY id DESC LIMIT 5')
    .all(req.params.subscriptionId, req.user.id)
    .map((r) => r.content)
    .reverse();

  const { flagged, reasons } = analyzeWithHistory(content, recent);
  const blocked = flagged && shouldBlock(reasons);

  if (flagged) {
    db.prepare(
      'INSERT INTO flagged_attempts (user_id, subscription_id, message, reasons, blocked) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, req.params.subscriptionId, content, reasons.join(','), blocked ? 1 : 0);
  }

  if (blocked) {
    db.prepare(
      'INSERT INTO messages (subscription_id, sender_id, content, flagged) VALUES (?, ?, ?, 1)'
    ).run(req.params.subscriptionId, req.user.id, '[رسالة اتمنعت - محتوى تواصل خارجي]');
    return res.status(422).json({ error: 'الرسالة اتمنعت: مش مسموح بمشاركة أرقام أو حسابات تواصل جوه الشات' });
  }

  const info = db
    .prepare('INSERT INTO messages (subscription_id, sender_id, content, flagged) VALUES (?, ?, ?, 0)')
    .run(req.params.subscriptionId, req.user.id, content.trim());

  res.json({ id: info.lastInsertRowid, ok: true });
});

// Admin oversight of a subscription's chat thread (spec §7: "view coach
// conversations") - a real, previously-absent read endpoint over the same
// `messages` table the two participants already use; no new data source.
router.get('/admin/:subscriptionId', requireAdmin, requirePermission('chat_support', 'view'), (req, res) => {
  const sub = db
    .prepare(
      `SELECT s.*, t.name AS trainee_name, c.name AS coach_name
       FROM subscriptions s JOIN users t ON t.id = s.trainee_id JOIN users c ON c.id = s.coach_id
       WHERE s.id = ?`
    )
    .get(req.params.subscriptionId);
  if (!sub) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  const messages = db
    .prepare('SELECT id, sender_id, content, flagged, created_at FROM messages WHERE subscription_id = ? ORDER BY id ASC')
    .all(req.params.subscriptionId);
  res.json({ subscription: sub, messages });
});

module.exports = router;
