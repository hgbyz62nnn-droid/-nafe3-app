const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAdmin } = require('../middleware/adminAuth');
const { adminLoginLimiter } = require('../lib/rateLimit');
const { listBackups, resolveBackupPath } = require('../lib/backup');

const router = express.Router();

const ADMIN_SESSION_MS = 7 * 24 * 60 * 60 * 1000; // shorter than user sessions - higher-value account

function signAdminToken(admin) {
  return jwt.sign({ adminId: admin.id, isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function setAdminCookie(res, token) {
  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_SESSION_MS,
  });
}

// بيشتغل مرة واحدة بس: أول ما يتعمل أدمن واحد، الباب ده بيتقفل لنفسه
// (بيرجع 403 لأي محاولة تانية) - مفيش سر ثابت في الكود محتاج يتحذف بعدين.
router.post('/bootstrap', (req, res) => {
  const { username, password } = req.body;
  const count = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (count > 0) return res.status(403).json({ error: 'في أدمن مسجل بالفعل، الإنشاء الأولي مقفول' });
  if (!username || !password || password.length < 10) {
    return res.status(400).json({ error: 'يوزرنيم وباسورد (10 حروف على الأقل) مطلوبين' });
  }
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, password_hash);
  res.json({ ok: true });
});

router.post('/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'يوزرنيم أو باسورد غلط' });
  }
  setAdminCookie(res, signAdminToken(admin));
  res.json({ ok: true, admin: { id: admin.id, username: admin.username } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.admin_token;
  if (!token) return res.json({ admin: null });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = db.prepare('SELECT id, username FROM admins WHERE id = ?').get(decoded.adminId);
    res.json({ admin: admin || null });
  } catch {
    res.json({ admin: null });
  }
});

router.post('/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(currentPassword || '', admin.password_hash)) {
    return res.status(401).json({ error: 'الباسورد الحالي غلط' });
  }
  if (!newPassword || newPassword.length < 10) {
    return res.status(400).json({ error: 'الباسورد الجديد لازم يكون 10 حروف على الأقل' });
  }
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), admin.id);
  res.json({ ok: true });
});

router.get('/stats', requireAdmin, (req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role != 'admin'").get().c;
  const activeSubscriptions = db.prepare("SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'active'").get().c;
  const totalCommission = db
    .prepare("SELECT COALESCE(SUM(commission_amount), 0) AS s FROM subscriptions WHERE status IN ('active','expired')")
    .get().s;
  res.json({ users, activeSubscriptions, totalCommission });
});

router.get('/backups', requireAdmin, (req, res) => {
  res.json({ backups: listBackups() });
});

router.get('/backups/:name', requireAdmin, (req, res) => {
  const filePath = resolveBackupPath(req.params.name);
  if (!filePath) return res.status(404).json({ error: 'النسخة الاحتياطية غير موجودة' });
  res.download(filePath);
});

module.exports = router;
