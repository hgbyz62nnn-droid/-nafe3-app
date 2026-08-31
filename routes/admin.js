const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

function requireAdminKey(req, res, next) {
  const expected = process.env.ADMIN_SECRET_KEY || '';
  const provided = req.get('x-admin-key') || '';
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  const valid =
    expected.length > 0 &&
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf);
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.delete('/users/by-email', requireAdminKey, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email مطلوب' });

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });

  db.prepare('DELETE FROM messages WHERE sender_id = ?').run(user.id);
  db.prepare('DELETE FROM subscriptions WHERE trainee_id = ? OR coach_id = ?').run(user.id, user.id);
  db.prepare('DELETE FROM coach_profiles WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

  res.json({ ok: true, deletedUserId: user.id });
});

module.exports = router;
