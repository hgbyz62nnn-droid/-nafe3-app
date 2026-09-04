const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin, requireSuperAdmin } = require('../middleware/adminAuth');
const { logAudit } = require('../lib/auditLog');

const router = express.Router();

// Every route in this file manages OTHER admin accounts - SUPER_ADMIN only,
// full stop (spec §1: "SUPER_ADMIN can manage other admins" / "an ADMIN
// cannot escalate itself to SUPER_ADMIN"). requireSuperAdmin already
// audits its own denials.
router.use(requireAdmin, requireSuperAdmin);

function activeSuperAdminCount(excludingId) {
  return db
    .prepare("SELECT COUNT(*) c FROM admins WHERE role = 'SUPER_ADMIN' AND status = 'active' AND id != ?")
    .get(excludingId ?? -1).c;
}

router.get('/', (req, res) => {
  const admins = db.prepare('SELECT id, username, role, status, created_at, created_by FROM admins ORDER BY id ASC').all();
  res.json({ admins });
});

router.post('/', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || password.length < 10) {
    return res.status(400).json({ error: 'يوزرنيم وباسورد (10 حروف على الأقل) مطلوبين' });
  }
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return res.status(400).json({ error: 'الصلاحية لازم تكون ADMIN أو SUPER_ADMIN' });
  }
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'اليوزرنيم ده مستخدم بالفعل' });

  const password_hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO admins (username, password_hash, role, created_by) VALUES (?, ?, ?, ?)')
    .run(username, password_hash, role, req.admin.id);
  logAudit(db, {
    adminId: req.admin.id, adminUsername: req.admin.username,
    action: 'create_admin', resourceType: 'admins', resourceId: info.lastInsertRowid,
    metadata: { username, role }, ip: req.ip,
  });
  res.json({ ok: true, admin: { id: info.lastInsertRowid, username, role, status: 'active' } });
});

// Role changes only - never allows an ADMIN to reach this route (requireSuperAdmin
// above already blocks that), and never allows the LAST active SUPER_ADMIN to be
// demoted (spec §1: "avoid accidentally locking out the only Super Admin").
// Self-demotion is blocked outright as a simpler, stricter version of the same rule.
router.patch('/:id/role', (req, res) => {
  const targetId = Number(req.params.id);
  const { role } = req.body;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return res.status(400).json({ error: 'الصلاحية لازم تكون ADMIN أو SUPER_ADMIN' });
  }
  const target = db.prepare('SELECT id, username, role FROM admins WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (targetId === req.admin.id) {
    return res.status(400).json({ error: 'مينفعش تغيّر صلاحية حسابك أنت نفسك' });
  }
  if (target.role === 'SUPER_ADMIN' && role === 'ADMIN' && activeSuperAdminCount(targetId) === 0) {
    return res.status(409).json({ error: 'ده آخر حساب Super Admin نشط - مينفعش تنزّل صلاحيته' });
  }
  db.prepare('UPDATE admins SET role = ? WHERE id = ?').run(role, targetId);
  logAudit(db, {
    adminId: req.admin.id, adminUsername: req.admin.username,
    action: 'change_admin_role', resourceType: 'admins', resourceId: targetId,
    metadata: { username: target.username, from: target.role, to: role }, ip: req.ip,
  });
  res.json({ ok: true });
});

router.post('/:id/suspend', (req, res) => {
  const targetId = Number(req.params.id);
  const target = db.prepare('SELECT id, username, role, status FROM admins WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (targetId === req.admin.id) {
    return res.status(400).json({ error: 'مينفعش تعلّق حسابك أنت نفسك' });
  }
  if (target.role === 'SUPER_ADMIN' && activeSuperAdminCount(targetId) === 0) {
    return res.status(409).json({ error: 'ده آخر حساب Super Admin نشط - مينفعش تعلّقه' });
  }
  db.prepare("UPDATE admins SET status = 'suspended' WHERE id = ?").run(targetId);
  logAudit(db, {
    adminId: req.admin.id, adminUsername: req.admin.username,
    action: 'suspend_admin', resourceType: 'admins', resourceId: targetId,
    metadata: { username: target.username }, ip: req.ip,
  });
  res.json({ ok: true });
});

router.post('/:id/restore', (req, res) => {
  const targetId = Number(req.params.id);
  const target = db.prepare('SELECT id, username FROM admins WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'الحساب غير موجود' });
  db.prepare("UPDATE admins SET status = 'active' WHERE id = ?").run(targetId);
  logAudit(db, {
    adminId: req.admin.id, adminUsername: req.admin.username,
    action: 'restore_admin', resourceType: 'admins', resourceId: targetId,
    metadata: { username: target.username }, ip: req.ip,
  });
  res.json({ ok: true });
});

module.exports = router;
