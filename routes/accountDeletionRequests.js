const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/adminAuth');
const { sendBroadcastEmail } = require('../lib/email');
const { deleteUserAccount } = require('../lib/accountDeletion');
const { emailActionLimiter } = require('../lib/rateLimit');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// عام، من غير تسجيل دخول - عشان Google Play بتطلب صفحة حذف حساب متاحة
// حتى للي مش عارف يسجل دخول تاني.
router.post('/', emailActionLimiter, async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'اكتب إيميل صحيح' });
  const reason = String(req.body.reason ?? '').trim().slice(0, 500) || null;

  db.prepare('INSERT INTO account_deletion_requests (email, reason) VALUES (?, ?)').run(email, reason);

  try {
    await sendBroadcastEmail(
      email,
      'استلمنا طلب حذف حسابك - Traino',
      'استلمنا طلبك بحذف حسابك وكل بياناتك من Traino. هنراجع الطلب ونتأكد من ملكيتك للحساب، وهيتم الحذف النهائي خلال أيام قليلة. لو محتاج أي حاجة تانية تواصل معانا.'
    );
  } catch (e) {
    console.log('فشل إرسال إيميل تأكيد طلب الحذف:', e.message);
  }

  res.json({ ok: true });
});

// -------------------- الأدمن --------------------

router.get('/admin/all', requireAdmin, (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.status && ['pending', 'completed', 'rejected'].includes(req.query.status)) {
    clauses.push('status = ?');
    params.push(req.query.status);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const requests = db
    .prepare(
      `SELECT * FROM account_deletion_requests ${where}
       ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC`
    )
    .all(...params)
    .map((r) => ({
      ...r,
      matchingUser: db.prepare('SELECT id, name, role, banned FROM users WHERE email = ?').get(r.email) || null,
    }));
  res.json({ requests });
});

router.post('/admin/:id/approve', requireAdmin, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM account_deletion_requests WHERE id = ?').get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'الطلب اتصرف فيه بالفعل' });

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(reqRow.email);
  if (!user) return res.status(404).json({ error: 'مفيش حساب مسجل بالإيميل ده' });

  deleteUserAccount(user.id);
  db.prepare("UPDATE account_deletion_requests SET status = 'completed', processed_at = datetime('now') WHERE id = ?").run(reqRow.id);
  res.json({ ok: true });
});

router.post('/admin/:id/reject', requireAdmin, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM account_deletion_requests WHERE id = ?').get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'الطلب اتصرف فيه بالفعل' });
  db.prepare("UPDATE account_deletion_requests SET status = 'rejected', processed_at = datetime('now') WHERE id = ?").run(reqRow.id);
  res.json({ ok: true });
});

module.exports = router;
