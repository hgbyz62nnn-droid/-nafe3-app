const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

router.post('/register', (req, res) => {
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
  const info = db
    .prepare('INSERT INTO users (role, name, email, password_hash) VALUES (?, ?, ?, ?)')
    .run(role, name, email, password_hash);

  if (role === 'coach') {
    db.prepare(
      'INSERT INTO coach_profiles (user_id, specialty, bio, certification, status) VALUES (?, ?, ?, ?, ?)'
    ).run(info.lastInsertRowid, '', '', '', 'pending');
  }

  const user = { id: info.lastInsertRowid, role, name };
  setAuthCookie(res, signToken(user));
  res.json({ user });
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
    const user = db.prepare('SELECT id, role, name, banned FROM users WHERE id = ?').get(decoded.id);
    if (!user || user.banned) return res.json({ user: null });
    res.json({ user: { id: user.id, role: user.role, name: user.name } });
  } catch {
    res.json({ user: null });
  }
});

// ==== صلاحيات الأدمن ====
router.get('/admin/users', requireAuth, requireRole('admin'), (req, res) => {
  const users = db.prepare("SELECT id, role, name, email, banned, created_at FROM users WHERE role != 'admin'").all();
  res.json({ users });
});

router.post('/admin/:id/ban', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/admin/:id/unban', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('UPDATE users SET banned = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.delete('/admin/:id', requireAuth, requireRole('admin'), (req, res) => {
  const userId = req.params.id;
  db.prepare('DELETE FROM messages WHERE sender_id = ?').run(userId);
  db.prepare('DELETE FROM subscriptions WHERE trainee_id = ? OR coach_id = ?').run(userId, userId);
  db.prepare('DELETE FROM coach_profiles WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ ok: true });
});

router.get('/setup/create-admin/nafe3secret2026', (req, res) => {
  const { email, password } = req.query;
  if (!email || !password) return res.status(400).send('لازم تحط email و password في الرابط');
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.send('في حساب بالإيميل ده خالص');
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (role, name, email, password_hash) VALUES (?, ?, ?, ?)').run('admin', 'Admin', email, password_hash);
  res.send('تم إنشاء حساب الأدمن بنجاح ✅');
});

module.exports = router;
