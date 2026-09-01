const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// اكتشاف مدربين تانيين (مش عرض تسويقي للمتدربين - ده للمدربين بعضهم
// بعض). نفس منطق استبعاد الحظر المستخدم في اكتشاف المتدربين للمدربين.
router.get('/', requireAuth, requireRole('coach'), (req, res) => {
  const clauses = ["c.status = 'approved'", 'u.id != ?'];
  const params = [req.user.id];
  if (req.query.q) {
    clauses.push('(u.name LIKE ? OR c.specialty LIKE ?)');
    const like = '%' + req.query.q + '%';
    params.push(like, like);
  }
  clauses.push(
    `u.id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = ?)
     AND u.id NOT IN (SELECT blocker_id FROM blocked_users WHERE blocked_id = ?)`
  );
  params.push(req.user.id, req.user.id);

  const coaches = db
    .prepare(
      `SELECT u.id, u.name, u.verified, u.avatar_path, c.specialty, c.location,
         (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE coach_id = u.id AND hidden = 0) AS avg_rating,
         (SELECT COUNT(*) FROM reviews WHERE coach_id = u.id AND hidden = 0) AS review_count,
         EXISTS(SELECT 1 FROM trainer_follows WHERE follower_id = ? AND followed_id = u.id) AS is_following
       FROM coach_profiles c JOIN users u ON u.id = c.user_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY u.id DESC`
    )
    .all(req.user.id, ...params);
  res.json({ coaches: coaches.map((c) => ({ ...c, is_following: !!c.is_following })) });
});

router.post('/follow/:coachId', requireAuth, requireRole('coach'), (req, res) => {
  const targetId = Number(req.params.coachId);
  if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'طلب غير صحيح' });
  const target = db.prepare("SELECT user_id FROM coach_profiles WHERE user_id = ? AND status = 'approved'").get(targetId);
  if (!target) return res.status(404).json({ error: 'المدرب غير موجود' });
  db.prepare('INSERT OR IGNORE INTO trainer_follows (follower_id, followed_id) VALUES (?, ?)').run(req.user.id, targetId);
  res.json({ ok: true });
});

router.delete('/follow/:coachId', requireAuth, requireRole('coach'), (req, res) => {
  db.prepare('DELETE FROM trainer_follows WHERE follower_id = ? AND followed_id = ?').run(req.user.id, Number(req.params.coachId));
  res.json({ ok: true });
});

module.exports = router;
