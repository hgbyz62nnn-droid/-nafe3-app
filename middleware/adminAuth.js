const jwt = require('jsonwebtoken');
const db = require('../db');

// منفصل تمامًا عن نظام تسجيل دخول اليوزرز العاديين (كوكي مختلف، جدول
// مختلف). أي route إداري لازم يستخدم الميدل وير ده.
function requireAdmin(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: 'لازم تسجل دخول كأدمن الأول' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) throw new Error('not an admin token');
    const admin = db.prepare('SELECT id, username FROM admins WHERE id = ?').get(decoded.adminId);
    if (!admin) return res.status(401).json({ error: 'الحساب غير موجود' });
    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ error: 'جلسة الدخول منتهية، سجّل دخول تاني' });
  }
}

module.exports = { requireAdmin };
