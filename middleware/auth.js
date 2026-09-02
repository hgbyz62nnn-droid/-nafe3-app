const jwt = require('jsonwebtoken');
const db = require('../db');

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'لازم تسجل دخول الأول' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, role, name, banned, token_version FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'الحساب غير موجود' });
    if (user.banned) return res.status(403).json({ error: 'تم حظر حسابك' });
    // لو كلمة المرور اتغيّرت من ساعة ما التوكن ده اتعمل (إعادة تعيين
    // كلمة مرور)، token_version في القاعدة بيبقى أكبر من اللي متسجل في
    // التوكن - أي جلسة قديمة بترفض هنا حتى لو التوكن نفسه لسه صالح توقيعه.
    // التوكنات القديمة (قبل ما الميزة دي تتضاف) مفيهاش claim اسمه tv
    // خالص - بنعتبرها version 0 ضمنيًا (زي أي مستخدم لسه معملش إعادة
    // تعيين) عشان جلسات المختبرين الحاليين اللي شغالة فعليًا مترفضش فجأة
    // بعد النشر مباشرة؛ أول إعادة تعيين فعلية لأي حساب بترفع القاعدة لـ 1
    // وتقفل التوكنات القديمة دي برضو تلقائيًا زي أي توكن تاني.
    const tokenVersion = decoded.tv ?? 0;
    if (tokenVersion !== user.token_version) {
      return res.status(401).json({ error: 'جلسة الدخول منتهية، سجّل دخول تاني' });
    }
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
    const user = db.prepare('SELECT id, role, name, banned, token_version FROM users WHERE id = ?').get(decoded.id);
    const tokenVersion = decoded.tv ?? 0;
    const valid = user && !user.banned && tokenVersion === user.token_version;
    req.user = valid ? { id: user.id, role: user.role, name: user.name } : null;
  } catch {
    req.user = null;
  }
  next();
}

module.exports = { requireAuth, requireRole, optionalAuth };
