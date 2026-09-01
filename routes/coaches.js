const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');

const router = express.Router();

const COACH_LIST_SELECT = `
  SELECT u.id, u.name, u.verified, u.avatar_path, u.bio AS profile_bio,
    c.specialty, c.bio, c.certification, c.status, c.gender, c.location, c.price_1m, c.price_3m, c.price_6m,
    (SELECT COUNT(*) FROM subscriptions WHERE coach_id = u.id AND status IN ('active','expired')) AS client_count,
    (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE coach_id = u.id AND hidden = 0) AS avg_rating,
    (SELECT COUNT(*) FROM reviews WHERE coach_id = u.id AND hidden = 0) AS review_count
  FROM coach_profiles c JOIN users u ON u.id = c.user_id
`;

router.get('/', optionalAuth, (req, res) => {
  const clauses = ["c.status = 'approved'"];
  const params = [];
  if (req.user) {
    clauses.push(
      `u.id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = ?)
       AND u.id NOT IN (SELECT blocker_id FROM blocked_users WHERE blocked_id = ?)`
    );
    params.push(req.user.id, req.user.id);
  }
  if (req.query.q) {
    clauses.push('(u.name LIKE ? OR c.specialty LIKE ?)');
    const like = '%' + req.query.q + '%';
    params.push(like, like);
  }
  if (req.query.minPrice) { clauses.push('c.price_1m >= ?'); params.push(Number(req.query.minPrice) || 0); }
  if (req.query.maxPrice) { clauses.push('c.price_1m <= ?'); params.push(Number(req.query.maxPrice) || 999999); }
  if (req.query.gender === 'male' || req.query.gender === 'female') {
    clauses.push('c.gender = ?'); params.push(req.query.gender);
  }
  if (req.query.location) { clauses.push('c.location = ?'); params.push(req.query.location); }
  if (req.query.minRating) { clauses.push('(SELECT AVG(rating) FROM reviews WHERE coach_id = u.id AND hidden = 0) >= ?'); params.push(Number(req.query.minRating) || 0); }

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

// قايمة المواقع الحقيقية اللي المدربين المعتمدين دخّلوها فعلاً، عشان شاشة
// الفلتر تعرض خيارات حقيقية بس مش قايمة مواقع وهمية.
router.get('/meta/locations', (req, res) => {
  const rows = db
    .prepare("SELECT DISTINCT c.location FROM coach_profiles c WHERE c.status = 'approved' AND c.location IS NOT NULL AND c.location != '' ORDER BY c.location")
    .all();
  res.json({ locations: rows.map((r) => r.location) });
});

// لو المدرب لسه مش معتمد (أول مرة بيعمل بروفايل، أو اتراجع قبل كده) مفيش
// نسخة عامة ظاهرة أصلًا للمتدربين، فالتعديل بيتكتب على coach_profiles
// مباشرة زي ما كان دايمًا - نفس طابور "طلبات المدربين" الموجود.
//
// لو المدرب معتمد بالفعل وظاهر في البحث العام، التعديل بيتكتب كمسودة في
// coach_profile_edits بس، وcoach_profiles (النسخة العامة) متتلمسش خالص
// لحد ما الأدمن يوافق - عشان كده المتدربين بيفضلوا شايفين النسخة القديمة
// طول فترة المراجعة بدل ما المدرب يختفي فجأة من نتائج البحث.
router.put('/me/profile', requireAuth, requireRole('coach'), (req, res) => {
  const { specialty, bio, certification, price_1m, price_3m, price_6m, gender, location } = req.body;
  const genderVal = ['male', 'female'].includes(gender) ? gender : null;
  const current = db.prepare('SELECT status FROM coach_profiles WHERE user_id = ?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'البروفايل غير موجود' });

  if (current.status !== 'approved') {
    db.prepare(
      `UPDATE coach_profiles SET specialty=?, bio=?, certification=?, price_1m=?, price_3m=?, price_6m=?, gender=?, location=?, status='pending'
       WHERE user_id=?`
    ).run(specialty, bio, certification, price_1m || 0, price_3m || 0, price_6m || 0, genderVal, location || null, req.user.id);
    return res.json({ ok: true, message: 'اتحفظ البروفايل وهيتراجع قبل ما يظهر للمتدربين' });
  }

  const existingEdit = db.prepare("SELECT id FROM coach_profile_edits WHERE coach_id = ? AND status = 'pending'").get(req.user.id);
  if (existingEdit) {
    db.prepare(
      `UPDATE coach_profile_edits SET specialty=?, bio=?, certification=?, price_1m=?, price_3m=?, price_6m=?, gender=?, location=?, created_at=datetime('now')
       WHERE id=?`
    ).run(specialty, bio, certification, price_1m || 0, price_3m || 0, price_6m || 0, genderVal, location || null, existingEdit.id);
  } else {
    db.prepare(
      `INSERT INTO coach_profile_edits (coach_id, specialty, bio, certification, price_1m, price_3m, price_6m, gender, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, specialty, bio, certification, price_1m || 0, price_3m || 0, price_6m || 0, genderVal, location || null);
  }
  res.json({ ok: true, message: 'اتبعت التعديل للمراجعة. البروفايل الحالي هيفضل ظاهر للمتدربين لحد ما الأدمن يوافق.' });
});

router.get('/me/profile', requireAuth, requireRole('coach'), (req, res) => {
  const profile = db.prepare('SELECT * FROM coach_profiles WHERE user_id = ?').get(req.user.id);
  const pendingEdit = db
    .prepare("SELECT * FROM coach_profile_edits WHERE coach_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(req.user.id);
  res.json({ profile, pendingEdit: pendingEdit && pendingEdit.status !== 'approved' ? pendingEdit : null });
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

// -------------------- طلبات تعديل بروفايل مدرب معتمد --------------------

router.get('/admin/pending-edits', requireAdmin, (req, res) => {
  const edits = db
    .prepare(
      `SELECT e.*, u.name AS coach_name, u.email AS coach_email,
         c.specialty AS live_specialty, c.bio AS live_bio, c.certification AS live_certification,
         c.price_1m AS live_price_1m, c.price_3m AS live_price_3m, c.price_6m AS live_price_6m,
         c.gender AS live_gender, c.location AS live_location
       FROM coach_profile_edits e
       JOIN users u ON u.id = e.coach_id
       JOIN coach_profiles c ON c.user_id = e.coach_id
       WHERE e.status = 'pending'
       ORDER BY e.created_at ASC`
    )
    .all();
  res.json({ edits });
});

router.post('/admin/edits/:id/approve', requireAdmin, (req, res) => {
  const edit = db.prepare('SELECT * FROM coach_profile_edits WHERE id = ?').get(req.params.id);
  if (!edit || edit.status !== 'pending') return res.status(404).json({ error: 'الطلب غير موجود' });
  db.prepare(
    `UPDATE coach_profiles SET specialty=?, bio=?, certification=?, price_1m=?, price_3m=?, price_6m=?, gender=?, location=?
     WHERE user_id=?`
  ).run(edit.specialty, edit.bio, edit.certification, edit.price_1m, edit.price_3m, edit.price_6m, edit.gender, edit.location, edit.coach_id);
  db.prepare("UPDATE coach_profile_edits SET status='approved', reviewed_at=datetime('now') WHERE id=?").run(edit.id);
  res.json({ ok: true });
});

router.post('/admin/edits/:id/reject', requireAdmin, (req, res) => {
  const edit = db.prepare('SELECT * FROM coach_profile_edits WHERE id = ?').get(req.params.id);
  if (!edit || edit.status !== 'pending') return res.status(404).json({ error: 'الطلب غير موجود' });
  const note = String(req.body.note ?? '').trim().slice(0, 500) || null;
  db.prepare("UPDATE coach_profile_edits SET status='rejected', review_note=?, reviewed_at=datetime('now') WHERE id=?").run(note, edit.id);
  res.json({ ok: true });
});

module.exports = router;
