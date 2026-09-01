const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');

const router = express.Router();

const COACH_LIST_SELECT = `
  SELECT u.id, u.name, u.verified, u.avatar_path, u.bio AS profile_bio,
    c.specialty, c.bio, c.certification, c.status, c.price_1m, c.price_3m, c.price_6m,
    (SELECT COUNT(*) FROM subscriptions WHERE coach_id = u.id AND status IN ('active','expired')) AS client_count,
    (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE coach_id = u.id AND hidden = 0) AS avg_rating,
    (SELECT COUNT(*) FROM reviews WHERE coach_id = u.id AND hidden = 0) AS review_count
  FROM coach_profiles c JOIN users u ON u.id = c.user_id
`;

router.get('/', (req, res) => {
  const clauses = ["c.status = 'approved'"];
  const params = [];
  if (req.query.q) {
    clauses.push('(u.name LIKE ? OR c.specialty LIKE ?)');
    const like = '%' + req.query.q + '%';
    params.push(like, like);
  }
  if (req.query.minPrice) { clauses.push('c.price_1m >= ?'); params.push(Number(req.query.minPrice) || 0); }
  if (req.query.maxPrice) { clauses.push('c.price_1m <= ?'); params.push(Number(req.query.maxPrice) || 999999); }

  const sortMap = {
    price_asc: 'c.price_1m ASC',
    price_desc: 'c.price_1m DESC',
    rating: 'avg_rating IS NULL, avg_rating DESC',
  };
  const orderBy = sortMap[req.query.sort] || 'u.id DESC';

  const coaches = db
    .prepare(`${COACH_LIST_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy}`)
    .all(...params);
  res.json({ coaches });
});

router.get('/:id', (req, res) => {
  const coach = db.prepare(`${COACH_LIST_SELECT} WHERE u.id = ?`).get(req.params.id);
  if (!coach) return res.status(404).json({ error: 'المدرب غير موجود' });
  res.json({ coach });
});

router.put('/me/profile', requireAuth, requireRole('coach'), (req, res) => {
  const { specialty, bio, certification, price_1m, price_3m, price_6m } = req.body;
  db.prepare(
    `UPDATE coach_profiles SET specialty=?, bio=?, certification=?, price_1m=?, price_3m=?, price_6m=?, status='pending'
     WHERE user_id=?`
  ).run(specialty, bio, certification, price_1m || 0, price_3m || 0, price_6m || 0, req.user.id);
  res.json({ ok: true, message: 'اتحفظ البروفايل وهيتراجع قبل ما يظهر للمتدربين' });
});

router.get('/me/profile', requireAuth, requireRole('coach'), (req, res) => {
  const profile = db.prepare('SELECT * FROM coach_profiles WHERE user_id = ?').get(req.user.id);
  res.json({ profile });
});

router.get('/admin/pending', requireAdmin, (req, res) => {
  const pending = db
    .prepare(
      `SELECT u.id, u.name, u.email, c.specialty, c.bio, c.certification
       FROM coach_profiles c JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending'`
    )
    .all();
  res.json({ pending });
});

router.post('/admin/:id/approve', requireAdmin, (req, res) => {
  db.prepare("UPDATE coach_profiles SET status='approved' WHERE user_id=?").run(req.params.id);
  res.json({ ok: true });
});

router.post('/admin/:id/reject', requireAdmin, (req, res) => {
  db.prepare("UPDATE coach_profiles SET status='rejected' WHERE user_id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
