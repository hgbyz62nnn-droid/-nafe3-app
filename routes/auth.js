const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

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

// تسجيل حساب جديد (متدرب أو مدرب)
router.post('/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !['trainee', 'coach'].includes(role)) {
    return res.status(400).json({ error: 'البيانات ناقصة أو غلط' });
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

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'الإيميل أو الباسورد غلط' });
  }
  setAuthCookie(res, signToken(user));
  res.json({ user: { id: user.id, role: user.role, name: user.name } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const jwt2 = require('jsonwebtoken');
  const token = req.cookies?.token;
  if (!token) return res.json({ user: null });
  try {
    const decoded = jwt2.verify(token, process.env.JWT_SECRET);
    res.json({ user: decoded });
  } catch {
    res.json({ user: null });
  }
});

module.exports = router;
