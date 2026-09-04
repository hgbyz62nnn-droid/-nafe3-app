const jwt = require('jsonwebtoken');
const db = require('../db');
const { hasPermission } = require('../lib/permissions');
const { logAudit } = require('../lib/auditLog');

// منفصل تمامًا عن نظام تسجيل دخول اليوزرز العاديين (كوكي مختلف، جدول
// مختلف). أي route إداري لازم يستخدم الميدل وير ده.
//
// Authenticates the admin (who are you) - it does NOT by itself decide
// what that admin is allowed to do. Every route that mutates or reveals
// admin-sensitive data must additionally chain requirePermission()
// (spec: "backend authorization must be authoritative; hiding buttons in
// the frontend is NOT sufficient").
function requireAdmin(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: 'لازم تسجل دخول كأدمن الأول' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) throw new Error('not an admin token');
    const admin = db.prepare('SELECT id, username, role, status FROM admins WHERE id = ?').get(decoded.adminId);
    if (!admin) return res.status(401).json({ error: 'الحساب غير موجود' });
    // A suspended admin account keeps a technically-valid JWT until it
    // expires, so this must be re-checked on every request, not just at
    // login - matches the `banned` re-check already done for normal users
    // in middleware/auth.js.
    if (admin.status === 'suspended') return res.status(403).json({ error: 'تم تعليق حساب الأدمن ده' });
    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ error: 'جلسة الدخول منتهية، سجّل دخول تاني' });
  }
}

// Central, resource+action permission gate (spec §2/§3). Chain AFTER
// requireAdmin. SUPER_ADMIN always passes; ADMIN passes only if
// lib/permissions.js grants that exact (resource, action) pair. A denial
// is itself an audited event so a pattern of an ADMIN probing for
// privileges it doesn't have is visible in the audit log.
function requirePermission(resource, action) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'لازم تسجل دخول كأدمن الأول' });
    if (hasPermission(req.admin.role, resource, action)) return next();
    try {
      logAudit(db, {
        adminId: req.admin.id,
        adminUsername: req.admin.username,
        action: `denied:${action}`,
        resourceType: resource,
        resourceId: null,
        metadata: { path: req.originalUrl, method: req.method },
        success: false,
        ip: req.ip,
      });
    } catch {}
    return res.status(403).json({ error: 'مش معاك صلاحية للحاجة دي' });
  };
}

// Shorthand for routes that are SUPER_ADMIN-only outright (admin
// management, audit log, and a few irreversible/high-blast-radius actions)
// rather than expressed as a granted resource+action pair.
function requireSuperAdmin(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: 'لازم تسجل دخول كأدمن الأول' });
  if (req.admin.role === 'SUPER_ADMIN') return next();
  try {
    logAudit(db, {
      adminId: req.admin.id,
      adminUsername: req.admin.username,
      action: 'denied:super_admin_only',
      resourceType: 'admins',
      resourceId: null,
      metadata: { path: req.originalUrl, method: req.method },
      success: false,
      ip: req.ip,
    });
  } catch {}
  return res.status(403).json({ error: 'الحاجة دي محتاجة صلاحية Super Admin' });
}

module.exports = { requireAdmin, requirePermission, requireSuperAdmin };
