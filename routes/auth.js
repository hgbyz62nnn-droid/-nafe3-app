const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAdmin } = require('../middleware/adminAuth');
const { sendVerificationEmail, sendBroadcastEmail } = require('../lib/email');
const { emailActionLimiter } = require('../lib/rateLimit');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post('/register', emailActionLimiter, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !['trainee', 'coach'].includes(role)) {
    return res.status(400).json({ error: 'البيانات ناقصة أو غلط' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'الباسورد لازم يكون 8 حروف على الأقل' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'الإيميل ده مسجل قبل كده' });

  const password_hash = bcrypt.hashSync(password, 10);
  const code = generateCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const info = db
    .prepare('INSERT INTO users (role, name, email, password_hash, verify_code, verify_expires) VALUES (?, ?, ?, ?, ?, ?)')
    .run(role, name, email, password_hash, code, expires);

  if (role === 'coach') {
    db.prepare(
      'INSERT INTO coach_profiles (user_id, specialty, bio, certification, status) VALUES (?, ?, ?, ?, ?)'
    ).run(info.lastInsertRowid, '', '', '', 'pending');
  }

  try {
    await sendVerificationEmail(email, code);
  } catch (e) {
    console.log('فشل إرسال إيميل التأكيد:', e.message);
  }

  res.json({ needsVerification: true, userId: info.lastInsertRowid, email });
});

router.post('/verify', async (req, res) => {
  const { email, code } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (user.verified) return res.status(400).json({ error: 'الحساب متأكد بالفعل' });
  if (user.verify_code !== code) return res.status(400).json({ error: 'الكود غلط' });
  if (new Date(user.verify_expires) < new Date()) return res.status(400).json({ error: 'الكود منتهي، اطلب كود جديد' });

  db.prepare("UPDATE users SET verified = 1, verify_code = NULL WHERE id = ?").run(user.id);
  setAuthCookie(res, signToken(user));
  res.json({ user: { id: user.id, role: user.role, name: user.name } });
});

router.post('/resend-code', emailActionLimiter, async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (user.verified) return res.status(400).json({ error: 'الحساب متأكد بالفعل' });

  const code = generateCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.prepare('UPDATE users SET verify_code = ?, verify_expires = ? WHERE id = ?').run(code, expires, user.id);

  try {
    await sendVerificationEmail(email, code);
  } catch (e) {
    return res.status(500).json({ error: 'فشل إرسال الإيميل' });
  }
  res.json({ ok: true });
});

let loginAttempts = {};
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const key = email || 'unknown';
  const attempts = loginAttempts[key] || { count: 0, time: Date.now() };
  if (Date.now() - attempts.time > 15 * 60 * 1000) { attempts.count = 0; attempts.time = Date.now(); }
  if (attempts.count >= 6) {
    return res.status(429).json({ error: 'محاولات كتير غلط، جرب تاني بعد شوية' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    attempts.count++; loginAttempts[key] = attempts;
    return res.status(401).json({ error: 'الإيميل أو الباسورد غلط' });
  }
  if (user.banned) return res.status(403).json({ error: 'تم حظر هذا الحساب' });
  if (!user.verified) return res.status(403).json({ error: 'لازم تأكد الإيميل الأول', needsVerification: true, email: user.email });

  delete loginAttempts[key];
  setAuthCookie(res, signToken(user));
  res.json({ user: { id: user.id, role: user.role, name: user.name } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.json({ user: null });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, role, name, email, banned FROM users WHERE id = ?').get(decoded.id);
    if (!user || user.banned) return res.json({ user: null });
    res.json({ user: { id: user.id, role: user.role, name: user.name, email: user.email } });
  } catch {
    res.json({ user: null });
  }
});

router.get('/admin/users', requireAdmin, (req, res) => {
  const q = req.query.q;
  let query = "SELECT id, role, name, email, banned, verified, created_at FROM users WHERE role != 'admin'";
  const params = [];
  if (q) {
    query += ' AND email LIKE ?';
    params.push(`%${q}%`);
  }
  query += ' ORDER BY id DESC';
  const users = db.prepare(query).all(...params);
  res.json({ users });
});

router.post('/admin/:id/ban', requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/admin/:id/unban', requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET banned = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// For when a user's verification email never arrives (bounced, stuck in
// spam, wrong address) and support needs to unblock their account by hand.
router.post('/admin/:id/verify', requireAdmin, (req, res) => {
  db.prepare("UPDATE users SET verified = 1, verify_code = NULL WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  db.prepare('DELETE FROM messages WHERE sender_id = ?').run(userId);
  db.prepare('DELETE FROM subscriptions WHERE trainee_id = ? OR coach_id = ?').run(userId, userId);
  db.prepare('DELETE FROM coach_profiles WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ ok: true });
});

router.get('/admin/flagged-attempts', requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const conditions = [];
  const params = [];
  if (req.query.reason) {
    conditions.push('fa.reasons LIKE ?');
    params.push(`%${req.query.reason}%`);
  }
  if (req.query.blocked === '0' || req.query.blocked === '1') {
    conditions.push('fa.blocked = ?');
    params.push(Number(req.query.blocked));
  }
  if (req.query.email) {
    conditions.push('u.email LIKE ?');
    params.push(`%${req.query.email}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const attempts = db
    .prepare(
      `SELECT fa.*, u.name AS user_name, u.email AS user_email
       FROM flagged_attempts fa
       JOIN users u ON u.id = fa.user_id
       ${where}
       ORDER BY fa.id DESC
       LIMIT ?`
    )
    .all(...params, limit);
  res.json({ attempts });
});

router.post('/admin/broadcast', requireAdmin, async (req, res) => {
  const { targetRole, subject, message } = req.body;
  const targets = (targetRole === 'trainee' || targetRole === 'coach')
    ? db.prepare('SELECT email FROM users WHERE role = ?').all(targetRole)
    : db.prepare("SELECT email FROM users WHERE role != 'admin'").all();

  let sent = 0, failed = 0;
  for (const t of targets) {
    try { await sendBroadcastEmail(t.email, subject, message); sent++; }
    catch (e) { failed++; }
  }
  res.json({ ok: true, sent, failed, total: targets.length });
});

module.exports = router;
