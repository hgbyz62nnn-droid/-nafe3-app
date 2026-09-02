const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');

const router = express.Router();

const CATEGORIES = ['payment', 'booking', 'account', 'trainer', 'technical', 'report', 'other'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'];

function ticketWithUnread(ticket, forAdmin) {
  const lastMsg = db
    .prepare('SELECT sender_type, created_at FROM support_messages WHERE ticket_id = ? ORDER BY id DESC LIMIT 1')
    .get(ticket.id);
  const seenAt = forAdmin ? ticket.admin_last_seen_at : ticket.user_last_seen_at;
  const otherSender = forAdmin ? 'user' : 'admin';
  const unread = !!(lastMsg && lastMsg.sender_type === otherSender && (!seenAt || lastMsg.created_at > seenAt));
  return { ...ticket, unread };
}

// -------------------- المستخدم (متدرب/كوتش) --------------------

router.post('/', requireAuth, (req, res) => {
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : null;
  const subject = String(req.body.subject ?? '').trim().slice(0, 120);
  const message = String(req.body.message ?? '').trim().slice(0, 2000);
  if (!category) return res.status(400).json({ error: 'اختار نوع المشكلة' });
  if (!subject || !message) return res.status(400).json({ error: 'اكتب عنوان ورسالة للمشكلة' });

  const info = db.prepare(
    "INSERT INTO support_tickets (user_id, category, subject) VALUES (?, ?, ?)"
  ).run(req.user.id, category, subject);
  db.prepare(
    "INSERT INTO support_messages (ticket_id, sender_type, content) VALUES (?, 'user', ?)"
  ).run(info.lastInsertRowid, message);
  res.json({ ok: true, ticketId: info.lastInsertRowid });
});

router.get('/mine', requireAuth, (req, res) => {
  const tickets = db
    .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user.id)
    .map((t) => ticketWithUnread(t, false));
  res.json({ tickets });
});

router.get('/:id', requireAuth, (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
  if (!ticket || (ticket.user_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(404).json({ error: 'التذكرة غير موجودة' });
  }
  const messages = db
    .prepare('SELECT sender_type, content, created_at FROM support_messages WHERE ticket_id = ? ORDER BY id ASC')
    .all(ticket.id);
  if (ticket.user_id === req.user.id) {
    db.prepare("UPDATE support_tickets SET user_last_seen_at = datetime('now') WHERE id = ?").run(ticket.id);
  }
  res.json({ ticket, messages });
});

router.post('/:id/reply', requireAuth, (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
  if (!ticket || ticket.user_id !== req.user.id) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  const message = String(req.body.message ?? '').trim().slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'اكتب رسالتك' });

  db.prepare("INSERT INTO support_messages (ticket_id, sender_type, content) VALUES (?, 'user', ?)").run(ticket.id, message);
  const nextStatus = ['waiting_user', 'resolved', 'closed'].includes(ticket.status) ? 'open' : ticket.status;
  db.prepare(
    "UPDATE support_tickets SET status = ?, user_last_seen_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(nextStatus, ticket.id);
  res.json({ ok: true });
});

// -------------------- الأدمن (نفس لوحة التحكم الحالية) --------------------

router.get('/admin/all', requireAdmin, (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.status && STATUSES.includes(req.query.status)) { clauses.push('t.status = ?'); params.push(req.query.status); }
  if (req.query.priority && PRIORITIES.includes(req.query.priority)) { clauses.push('t.priority = ?'); params.push(req.query.priority); }
  if (req.query.category && CATEGORIES.includes(req.query.category)) { clauses.push('t.category = ?'); params.push(req.query.category); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

  const tickets = db
    .prepare(
      `SELECT t.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM support_tickets t JOIN users u ON u.id = t.user_id
       ${where}
       ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.updated_at DESC`
    )
    .all(...params)
    .map((t) => ticketWithUnread(t, true));
  res.json({ tickets });
});

router.get('/admin/:id', requireAdmin, (req, res) => {
  const ticket = db
    .prepare(
      `SELECT t.*, u.name AS user_name, u.email AS user_email, u.role AS user_role, u.banned AS user_banned
       FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?`
    )
    .get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });

  const messages = db
    .prepare('SELECT sender_type, content, created_at FROM support_messages WHERE ticket_id = ? ORDER BY id ASC')
    .all(ticket.id);

  // سياق سريع عن صاحب التذكرة عشان الأدمن ميحتاجش يدور في تابات تانية.
  const activeSub = ticket.user_role === 'trainee'
    ? db.prepare(
        `SELECT s.*, c.name AS coach_name FROM subscriptions s JOIN users c ON c.id = s.coach_id
         WHERE s.trainee_id = ? AND s.status = 'active'`
      ).get(ticket.user_id)
    : db.prepare("SELECT COUNT(*) AS c FROM subscriptions WHERE coach_id = ? AND status = 'active'").get(ticket.user_id);

  db.prepare("UPDATE support_tickets SET admin_last_seen_at = datetime('now') WHERE id = ?").run(ticket.id);
  res.json({ ticket, messages, context: { activeSubscription: activeSub || null } });
});

router.post('/admin/:id/reply', requireAdmin, (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  const message = String(req.body.message ?? '').trim().slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'اكتب ردك' });

  db.prepare("INSERT INTO support_messages (ticket_id, sender_type, content) VALUES (?, 'admin', ?)").run(ticket.id, message);
  const nextStatus = ticket.status === 'open' ? 'in_progress' : ticket.status;
  db.prepare(
    "UPDATE support_tickets SET status = ?, admin_last_seen_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(nextStatus, ticket.id);
  res.json({ ok: true });
});

router.post('/admin/:id/status', requireAdmin, (req, res) => {
  const updates = [];
  const params = [];
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
    updates.push('status = ?'); params.push(req.body.status);
  }
  if (req.body.priority !== undefined) {
    if (!PRIORITIES.includes(req.body.priority)) return res.status(400).json({ error: 'أولوية غير صحيحة' });
    updates.push('priority = ?'); params.push(req.body.priority);
  }
  if (req.body.category !== undefined) {
    if (!CATEGORIES.includes(req.body.category)) return res.status(400).json({ error: 'نوع غير صحيح' });
    updates.push('category = ?'); params.push(req.body.category);
  }
  if (!updates.length) return res.status(400).json({ error: 'مفيش حاجة للتحديث' });
  params.push(req.params.id);
  db.prepare(`UPDATE support_tickets SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

module.exports = router;
