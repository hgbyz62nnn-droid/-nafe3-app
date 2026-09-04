const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAdmin, requirePermission } = require('../middleware/adminAuth');
const { sendVerificationEmail, sendPasswordResetEmail, sendBroadcastEmail } = require('../lib/email');
const { emailActionLimiter } = require('../lib/rateLimit');
const { deleteUserAccount } = require('../lib/accountDeletion');
const { logAudit } = require('../lib/auditLog');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name, tv: user.token_version ?? 0 }, process.env.JWT_SECRET, {
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

const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const MAX_RESET_REQUESTS_PER_WINDOW = 3;
const MAX_RESET_ATTEMPTS = 5;

// نفس رسالة النجاح دايمًا بغض النظر عن وجود الإيميل من عدمه، وحتى لو
// الإيميل موجود بس وصل للحد الأقصى من الطلبات - عشان محدش يقدر يستخدم
// الفورم ده يكتشف مين مسجل عندنا (enumeration attack) من شكل الرد نفسه.
// حد emailActionLimiter (نفس نظام الـ rate limiting الموجود بالفعل،
// per-IP) بيرفض قبل ما نوصل هنا خالص لو حصل سبام على نفس الـ IP.
router.post('/forgot-password', emailActionLimiter, async (req, res) => {
  const genericOk = () => res.json({ ok: true });
  const email = String(req.body.email ?? '').trim();
  if (!email) return genericOk();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || user.banned) return genericOk();

  // حد إضافي لكل إيميل بعينه (مش بس لكل IP) - عشان محدش يقدر يستنزف رصيد
  // إيميلات Resend أو يضايق صاحب حساب معيّن من عدة أجهزة/IPs مختلفة.
  const recentCount = db
    .prepare("SELECT COUNT(*) c FROM password_resets WHERE user_id = ? AND created_at > datetime('now', '-15 minutes')")
    .get(user.id).c;
  if (recentCount >= MAX_RESET_REQUESTS_PER_WINDOW) return genericOk();

  const code = generateCode();
  const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();
  db.prepare('INSERT INTO password_resets (user_id, code, expires_at) VALUES (?, ?, ?)').run(user.id, code, expires);

  try {
    await sendPasswordResetEmail(email, code);
  } catch (e) {
    console.log('فشل إرسال إيميل إعادة تعيين كلمة المرور:', e.message);
  }
  genericOk();
});

router.post('/reset-password', async (req, res) => {
  const email = String(req.body.email ?? '').trim();
  const code = String(req.body.code ?? '').trim();
  const newPassword = String(req.body.newPassword ?? '');
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'البيانات ناقصة' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'الباسورد لازم يكون 8 حروف على الأقل' });

  const genericInvalid = () => res.status(400).json({ error: 'الكود غلط أو منتهي الصلاحية' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return genericInvalid();

  const reset = db
    .prepare("SELECT * FROM password_resets WHERE user_id = ? AND used = 0 ORDER BY created_at DESC LIMIT 1")
    .get(user.id);
  if (!reset) return genericInvalid();
  if (new Date(reset.expires_at) < new Date()) return genericInvalid();
  if (reset.attempts >= MAX_RESET_ATTEMPTS) {
    return res.status(400).json({ error: 'محاولات كتير غلط، اطلب كود جديد' });
  }
  if (reset.code !== code) {
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?').run(reset.id);
    return res.status(400).json({ error: 'الكود غلط' });
  }

  const password_hash = bcrypt.hashSync(newPassword, 10);
  const run = db.transaction(() => {
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
    // token_version+1 بيلغي أي جلسة دخول قديمة (JWT) فورًا - لو حد كان
    // مستولي على الحساب قبل كده، بيتقفل بره في اللحظة دي بالظبط.
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(password_hash, user.id);
  });
  run();

  const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  setAuthCookie(res, signToken(freshUser));
  res.json({ user: { id: freshUser.id, role: freshUser.role, name: freshUser.name } });
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
    const user = db.prepare('SELECT id, role, name, email, avatar_path, bio, banned, token_version FROM users WHERE id = ?').get(decoded.id);
    // نفس فحص token_version اللي في middleware/auth.js - الراوت ده بيعمل
    // تحقق مستقل من التوكن بدل ما يستخدم requireAuth (عشان الزائر الغير
    // مسجل يرجع user:null مش 401)، فلازم يتكرر هنا برضو وإلا جلسة اتلغت
    // بإعادة تعيين كلمة المرور تفضل شغالة هنا بالغلط.
    const tokenVersion = decoded.tv ?? 0;
    if (!user || user.banned || tokenVersion !== user.token_version) return res.json({ user: null });
    res.json({ user: { id: user.id, role: user.role, name: user.name, email: user.email, avatarPath: user.avatar_path, bio: user.bio } });
  } catch {
    res.json({ user: null });
  }
});

router.get('/admin/users', requireAdmin, requirePermission('users', 'view'), (req, res) => {
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

router.post('/admin/:id/ban', requireAdmin, requirePermission('users', 'suspend'), (req, res) => {
  db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(req.params.id);
  logAudit(db, { adminId: req.admin.id, adminUsername: req.admin.username, action: 'ban_user', resourceType: 'users', resourceId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

router.post('/admin/:id/unban', requireAdmin, requirePermission('users', 'restore'), (req, res) => {
  db.prepare('UPDATE users SET banned = 0 WHERE id = ?').run(req.params.id);
  logAudit(db, { adminId: req.admin.id, adminUsername: req.admin.username, action: 'unban_user', resourceType: 'users', resourceId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

// For when a user's verification email never arrives (bounced, stuck in
// spam, wrong address) and support needs to unblock their account by hand.
router.post('/admin/:id/verify', requireAdmin, requirePermission('users', 'edit'), (req, res) => {
  db.prepare("UPDATE users SET verified = 1, verify_code = NULL WHERE id = ?").run(req.params.id);
  logAudit(db, { adminId: req.admin.id, adminUsername: req.admin.username, action: 'manual_verify_user', resourceType: 'users', resourceId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

// Permanent, irreversible deletion of a user's account and all their data -
// reserved to SUPER_ADMIN (spec §5: "reset relevant account state" is an
// ADMIN action via ban/unban/verify above; a full hard delete is not).
router.delete('/admin/:id', requireAdmin, requirePermission('users', 'delete'), (req, res) => {
  const deleted = deleteUserAccount(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'المستخدم غير موجود' });
  logAudit(db, { adminId: req.admin.id, adminUsername: req.admin.username, action: 'delete_user', resourceType: 'users', resourceId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

router.get('/admin/flagged-attempts', requireAdmin, requirePermission('moderation', 'view'), (req, res) => {
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

// The only platform-wide "notification/announcement" mechanism that
// actually exists in this codebase is this broadcast email - there is no
// push-notification infrastructure implemented anywhere, so the admin
// panel's Notifications section does not claim one (spec §13: "do NOT fake
// them"). Sending an email to every user is high blast-radius, so it's
// reserved to SUPER_ADMIN.
router.post('/admin/broadcast', requireAdmin, requirePermission('notifications', 'manage'), async (req, res) => {
  const { targetRole, subject, message } = req.body;
  const targets = (targetRole === 'trainee' || targetRole === 'coach')
    ? db.prepare('SELECT email FROM users WHERE role = ?').all(targetRole)
    : db.prepare("SELECT email FROM users WHERE role != 'admin'").all();

  let sent = 0, failed = 0;
  for (const t of targets) {
    try { await sendBroadcastEmail(t.email, subject, message); sent++; }
    catch (e) { failed++; }
  }
  logAudit(db, {
    adminId: req.admin.id, adminUsername: req.admin.username,
    action: 'send_broadcast', resourceType: 'notifications', resourceId: null,
    metadata: { targetRole: targetRole || 'all', subject, sent, failed, total: targets.length }, ip: req.ip,
  });
  res.json({ ok: true, sent, failed, total: targets.length });
});

module.exports = router;
