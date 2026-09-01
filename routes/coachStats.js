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

  const { sessionsToday } = db
    .prepare(
      `SELECT COUNT(*) AS sessionsToday FROM booked_sessions bs
       JOIN subscriptions s ON s.id = bs.subscription_id
       WHERE s.coach_id = ? AND bs.status = 'scheduled' AND date(bs.scheduled_at) = date('now')`
    )
    .get(coachId);

  const { monthRevenue } = db
    .prepare(
      `SELECT COALESCE(SUM(coach_payout), 0) AS monthRevenue FROM subscriptions
       WHERE coach_id = ? AND status IN ('active','expired') AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
    )
    .get(coachId);

  const { avgRating } = db
    .prepare('SELECT ROUND(AVG(rating), 1) AS avgRating FROM reviews WHERE coach_id = ? AND hidden = 0')
    .get(coachId);
  const satisfactionPct = avgRating ? Math.round((avgRating / 5) * 100) : null;

  const upcomingList = db
    .prepare(
      `SELECT bs.id, bs.scheduled_at, t.name AS trainee_name, t.avatar_path AS trainee_avatar
       FROM booked_sessions bs
       JOIN subscriptions s ON s.id = bs.subscription_id
       JOIN users t ON t.id = s.trainee_id
       WHERE s.coach_id = ? AND bs.status = 'scheduled' AND bs.scheduled_at > datetime('now')
       ORDER BY bs.scheduled_at ASC LIMIT 3`
    )
    .all(coachId);

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

  res.json({ activeTrainees, revenue, upcomingSessions, adherenceRate, sessionsToday, monthRevenue, satisfactionPct, upcomingList });
});

module.exports = router;
