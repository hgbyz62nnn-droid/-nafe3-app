const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAdmin, requirePermission, requireSuperAdmin } = require('../middleware/adminAuth');
const { adminLoginLimiter } = require('../lib/rateLimit');
const { listBackups, resolveBackupPath } = require('../lib/backup');
const { logAudit } = require('../lib/auditLog');

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
// The very first admin ever created this way is the platform's first
// SUPER_ADMIN (nobody exists yet to grant it, so it has to be self-granted
// exactly once) - every admin after this one is created via the SUPER_ADMIN-
// only routes/admins.js and defaults to ADMIN.
router.post('/bootstrap', (req, res) => {
  const { username, password } = req.body;
  const count = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (count > 0) return res.status(403).json({ error: 'في أدمن مسجل بالفعل، الإنشاء الأولي مقفول' });
  if (!username || !password || password.length < 10) {
    return res.status(400).json({ error: 'يوزرنيم وباسورد (10 حروف على الأقل) مطلوبين' });
  }
  const password_hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO admins (username, password_hash, role) VALUES (?, ?, 'SUPER_ADMIN')")
    .run(username, password_hash);
  logAudit(db, {
    adminId: info.lastInsertRowid,
    adminUsername: username,
    action: 'bootstrap_super_admin',
    resourceType: 'admins',
    resourceId: info.lastInsertRowid,
    metadata: { note: 'first admin account, self-bootstrapped as SUPER_ADMIN' },
    ip: req.ip,
  });
  res.json({ ok: true });
});

router.post('/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'يوزرنيم أو باسورد غلط' });
  }
  if (admin.status === 'suspended') return res.status(403).json({ error: 'تم تعليق حساب الأدمن ده' });
  setAdminCookie(res, signAdminToken(admin));
  res.json({ ok: true, admin: { id: admin.id, username: admin.username, role: admin.role } });
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
    const admin = db.prepare('SELECT id, username, role, status FROM admins WHERE id = ?').get(decoded.adminId);
    if (!admin || admin.status === 'suspended') return res.json({ admin: null });
    res.json({ admin: { id: admin.id, username: admin.username, role: admin.role } });
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
  logAudit(db, {
    adminId: req.admin.id, adminUsername: req.admin.username,
    action: 'change_own_password', resourceType: 'admins', resourceId: admin.id, ip: req.ip,
  });
  res.json({ ok: true });
});

// Every figure here is a direct COUNT/SUM over persisted rows - none of it
// is estimated or fabricated (spec §12: "never fabricate metrics").
router.get('/stats', requireAdmin, requirePermission('analytics', 'view'), (req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role != 'admin'").get().c;
  const athletes = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'trainee'").get().c;
  const coaches = db.prepare("SELECT COUNT(*) AS c FROM coach_profiles WHERE status = 'approved'").get().c;
  const pendingCoachApprovals = db.prepare("SELECT COUNT(*) AS c FROM coach_profiles WHERE status = 'pending'").get().c;
  const activeSubscriptions = db.prepare("SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'active'").get().c;
  const totalCommission = db
    .prepare("SELECT COALESCE(SUM(commission_amount), 0) AS s FROM subscriptions WHERE status IN ('active','expired')")
    .get().s;
  const totalCoachPayouts = db
    .prepare("SELECT COALESCE(SUM(coach_payout), 0) AS s FROM subscriptions WHERE status IN ('active','expired')")
    .get().s;
  const completedSessions = db.prepare("SELECT COUNT(*) AS c FROM booked_sessions WHERE status = 'completed'").get().c;
  const checkInsSubmitted = db.prepare('SELECT COUNT(*) AS c FROM check_ins').get().c;
  const progressEntriesLogged = db.prepare('SELECT COUNT(*) AS c FROM progress_entries').get().c;
  const openSupportTickets = db.prepare("SELECT COUNT(*) AS c FROM support_tickets WHERE status IN ('open','in_progress','waiting_user')").get().c;
  const openUserReports = db.prepare("SELECT COUNT(*) AS c FROM user_reports WHERE status = 'open'").get().c;
  res.json({
    users, athletes, coaches, pendingCoachApprovals, activeSubscriptions,
    totalCommission, totalCoachPayouts, completedSessions,
    checkInsSubmitted, progressEntriesLogged, openSupportTickets, openUserReports,
  });
});

// Full raw DB backups contain every user's password hash and every private
// message/document on the platform - reserved to SUPER_ADMIN outright
// (spec §10: "do not weaken payment-provider security" / §2: settings is a
// SUPER_ADMIN-only resource).
router.get('/backups', requireAdmin, requireSuperAdmin, (req, res) => {
  res.json({ backups: listBackups() });
});

router.get('/backups/:name', requireAdmin, requireSuperAdmin, (req, res) => {
  const filePath = resolveBackupPath(req.params.name);
  if (!filePath) return res.status(404).json({ error: 'النسخة الاحتياطية غير موجودة' });
  logAudit(db, {
    adminId: req.admin.id, adminUsername: req.admin.username,
    action: 'download_backup', resourceType: 'settings', resourceId: req.params.name, ip: req.ip,
  });
  res.download(filePath);
});

// Audit trail itself - read-only, SUPER_ADMIN only (spec §2: "audit_logs"
// is empty for ADMIN so it can never view or tamper with the record of its
// own actions). No update/delete route exists for this table anywhere.
router.get('/audit-log', requireAdmin, requireSuperAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const conditions = [];
  const params = [];
  if (req.query.resourceType) { conditions.push('resource_type = ?'); params.push(req.query.resourceType); }
  if (req.query.adminId) { conditions.push('admin_id = ?'); params.push(req.query.adminId); }
  if (req.query.success === '0' || req.query.success === '1') { conditions.push('success = ?'); params.push(Number(req.query.success)); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const entries = db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ?`).all(...params, limit);
  res.json({ entries });
});

module.exports = router;
