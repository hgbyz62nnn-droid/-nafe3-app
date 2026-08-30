const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { containsContactInfo } = require('../lib/privacyFilter');

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
  res.json({ messages });
});

router.post('/:subscriptionId', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'اكتب رسالة الأول' });

  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.subscriptionId);
  if (!assertParticipant(sub, req.user.id)) return res.status(403).json({ error: 'مش معاك صلاحية' });
  if (sub.status !== 'active') return res.status(403).json({ error: 'الشات بيتفعّل بعد تأكيد الاشتراك' });

  const flagged = containsContactInfo(content) ? 1 : 0;

  if (flagged) {
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

module.exports = router;
