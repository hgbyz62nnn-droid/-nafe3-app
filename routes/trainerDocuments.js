const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/adminAuth');
const { logAudit } = require('../lib/auditLog');
const { saveTrainerDocument, deletePrivateDoc } = require('../lib/media');
const { privateDocsDir } = require('../lib/paths');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const DOC_TYPES = ['id', 'certification', 'other'];

// المستند ده لازم يتشاف من صاحبه (نظام تسجيل دخول اليوزرز، كوكي token) أو
// من الأدمن (نظام منفصل تمامًا، كوكي admin_token) - مفيش route تاني في
// التطبيق محتاج الاتنين مع بعض، فبنعمل تحقق مخصص هنا بدل ما نلخبط
// requireAuth/requireAdmin الأصليين اللي كل واحد بيرفض لو الكوكي التانية بس موجودة.
// بنتأكد من admin_token الأول: لوحة الأدمن على نفس الدومين، فلو حصل وكانت
// كوكي token عادية موجودة كمان في نفس المتصفح لازم مايبقاش لها أولوية أعلى
// من جلسة الأدمن الفعلية.
function requireOwnerOrAdmin(req, res, next) {
  const adminToken = req.cookies?.admin_token;
  if (adminToken) {
    try {
      const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
      if (decoded.isAdmin) {
        const admin = db.prepare('SELECT id FROM admins WHERE id = ?').get(decoded.adminId);
        if (admin) { req.authIsAdmin = true; return next(); }
      }
    } catch { /* fall through to user check */ }
  }
  const userToken = req.cookies?.token;
  if (userToken) {
    try {
      const decoded = jwt.verify(userToken, process.env.JWT_SECRET);
      const user = db.prepare('SELECT id, role, banned, token_version FROM users WHERE id = ?').get(decoded.id);
      // نفس فحص token_version اللي في middleware/auth.js - الراوت ده بيعمل
      // تحقق مستقل من التوكن مش عن طريق requireAuth، فلازم يتكرر هنا برضو.
      const tokenVersion = decoded.tv ?? 0;
      if (user && !user.banned && tokenVersion === user.token_version) {
        req.authUser = { id: user.id, role: user.role };
        return next();
      }
    } catch { /* fall through to rejection */ }
  }
  return res.status(401).json({ error: 'لازم تسجل دخول الأول' });
}

function runUpload(req, res, next) {
  upload.single('document')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'حجم الملف أكبر من 10 ميجا' });
    }
    if (err) return res.status(400).json({ error: 'حصل خطأ في رفع الملف' });
    next();
  });
}

// -------------------- المدرب --------------------

router.post('/', requireAuth, requireRole('coach'), runUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'اختار ملف' });
  const docType = DOC_TYPES.includes(req.body.docType) ? req.body.docType : null;
  if (!docType) return res.status(400).json({ error: 'اختار نوع المستند' });
  const name = String(req.body.name ?? '').trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: 'اكتب اسم للمستند' });

  try {
    const { filename, mimeType } = await saveTrainerDocument(req.file.buffer);
    const info = db.prepare(
      'INSERT INTO trainer_documents (coach_id, doc_type, name, file_path, mime_type) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, docType, name, filename, mimeType);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message || 'حصل خطأ في رفع الملف' });
  }
});

router.get('/mine', requireAuth, requireRole('coach'), (req, res) => {
  const documents = db
    .prepare('SELECT id, doc_type, name, mime_type, status, review_note, created_at, reviewed_at FROM trainer_documents WHERE coach_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json({ documents });
});

router.delete('/:id', requireAuth, requireRole('coach'), (req, res) => {
  const doc = db.prepare('SELECT * FROM trainer_documents WHERE id = ?').get(req.params.id);
  if (!doc || doc.coach_id !== req.user.id) return res.status(404).json({ error: 'المستند غير موجود' });
  db.prepare('DELETE FROM trainer_documents WHERE id = ?').run(doc.id);
  deletePrivateDoc(doc.file_path);
  res.json({ ok: true });
});

// الملف نفسه - خاص تمامًا، بس صاحب المستند أو الأدمن يقدروا يشوفوه.
router.get('/:id/file', requireOwnerOrAdmin, (req, res) => {
  const doc = db.prepare('SELECT * FROM trainer_documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });
  if (!req.authIsAdmin && doc.coach_id !== req.authUser.id) {
    return res.status(403).json({ error: 'مش معاك صلاحية' });
  }
  const filePath = path.join(privateDocsDir, doc.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'الملف غير موجود' });
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.name)}"`);
  res.type(doc.mime_type).sendFile(filePath);
});

// -------------------- الأدمن --------------------

router.get('/admin/all', requireAdmin, requirePermission('coach_documents', 'view'), (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.status && ['pending', 'approved', 'rejected'].includes(req.query.status)) {
    clauses.push('d.status = ?');
    params.push(req.query.status);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const documents = db
    .prepare(
      `SELECT d.*, u.name AS coach_name, u.email AS coach_email
       FROM trainer_documents d JOIN users u ON u.id = d.coach_id
       ${where}
       ORDER BY CASE d.status WHEN 'pending' THEN 0 ELSE 1 END, d.created_at DESC`
    )
    .all(...params);
  res.json({ documents });
});

router.post('/admin/:id/review', requireAdmin, requirePermission('coach_documents', 'edit'), (req, res) => {
  const doc = db.prepare('SELECT * FROM trainer_documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });
  const action = ['approve', 'reject'].includes(req.body.action) ? req.body.action : null;
  if (!action) return res.status(400).json({ error: 'إجراء غير صحيح' });
  const note = String(req.body.note ?? '').trim().slice(0, 500) || null;

  db.prepare(
    "UPDATE trainer_documents SET status = ?, review_note = ?, reviewed_at = datetime('now') WHERE id = ?"
  ).run(action === 'approve' ? 'approved' : 'rejected', note, doc.id);
  logAudit(db, { adminId: req.admin.id, adminUsername: req.admin.username, action: `${action}_trainer_document`, resourceType: 'coach_documents', resourceId: doc.id, metadata: { coachId: doc.coach_id, note }, ip: req.ip });
  res.json({ ok: true });
});

module.exports = router;
