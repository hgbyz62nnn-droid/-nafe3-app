const jwt = require('jsonwebtoken');
const db = require('../db');

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'لازم تسجل دخول الأول' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, role, name, banned FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'الحساب غير موجود' });
    if (user.banned) return res.status(403).json({ error: 'تم حظر حسابك' });
    req.user = { id: user.id, role: user.role, name: user.name };
    next();
  } catch {
    return res.status(401).json({ error: 'جلسة الدخول منتهية، سجّل دخول تاني' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'مش معاك صلاحية للحاجة دي' });
    }
    next();
  };
}

// زي requireAuth بس من غير ما يرفض الطلب لو مفيش تسجيل دخول - مستخدم في
// أي مكان لازم يشتغل للزوّار كمان بس محتاج يعرف مين المستخدم لو مسجل.
function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) { req.user = null; return next(); }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, role, name, banned FROM users WHERE id = ?').get(decoded.id);
    req.user = user && !user.banned ? { id: user.id, role: user.role, name: user.name } : null;
  } catch {
    req.user = null;
  }
  next();
}

module.exports = { requireAuth, requireRole, optionalAuth };
