const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole('coach'), (req, res) => {
  const coachId = req.user.id;

  const { activeTrainees } = db
    .prepare("SELECT COUNT(*) AS activeTrainees FROM subscriptions WHERE coach_id = ? AND status = 'active'")
    .get(coachId);

  const { revenue } = db
    .prepare(
      "SELECT COALESCE(SUM(coach_payout), 0) AS revenue FROM subscriptions WHERE coach_id = ? AND status IN ('active','expired')"
    )
    .get(coachId);

  const { upcomingSessions } = db
    .prepare(
      `SELECT COUNT(*) AS upcomingSessions FROM booked_sessions bs
       JOIN subscriptions s ON s.id = bs.subscription_id
       WHERE s.coach_id = ? AND bs.status = 'scheduled' AND bs.scheduled_at > datetime('now')`
    )
    .get(coachId);

  // معدل الالتزام: نسبة تعليمات "اتعمل" فعليًا من إجمالي الفرص الممكنة (عدد
  // العادات المفعّلة × 7 أيام) لكل اشتراك نشط تحت الكوتش ده في آخر أسبوع.
  const activeSubs = db
    .prepare("SELECT id FROM subscriptions WHERE coach_id = ? AND status = 'active'")
    .all(coachId);

  let totalPossible = 0;
  let totalDone = 0;
  for (const sub of activeSubs) {
    const { habitCount } = db
      .prepare('SELECT COUNT(*) AS habitCount FROM habit_definitions WHERE subscription_id = ? AND active = 1')
      .get(sub.id);
    if (habitCount === 0) continue;
    const { doneCount } = db
      .prepare(
        `SELECT COUNT(*) AS doneCount FROM habit_logs hl
         JOIN habit_definitions hd ON hd.id = hl.habit_id
         WHERE hd.subscription_id = ? AND hl.done = 1 AND hl.log_date >= date('now', '-7 days')`
      )
      .get(sub.id);
    totalPossible += habitCount * 7;
    totalDone += doneCount;
  }
  const adherenceRate = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : null;

  res.json({ activeTrainees, revenue, upcomingSessions, adherenceRate });
});

module.exports = router;
