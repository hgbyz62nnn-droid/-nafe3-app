const db = require('../db');

// Badge key -> { label_ar, label_en, icon, check(sub) -> boolean earned }.
// Kept as plain conditions (no stored "progress"), checked opportunistically
// after activity that could unlock one, and upserted into badges_earned.
const BADGES = {
  first_week: {
    icon: '🌱',
    label_ar: 'أول أسبوع',
    label_en: 'First Week',
    check: (subId) => {
      const sub = db.prepare('SELECT created_at FROM subscriptions WHERE id = ?').get(subId);
      if (!sub) return false;
      const days = (Date.now() - new Date(sub.created_at + 'Z').getTime()) / 86400000;
      return days >= 7;
    },
  },
  ten_habit_checkins: {
    icon: '✅',
    label_ar: '10 التزامات يومية',
    label_en: '10 Habit Check-ins',
    check: (subId) => {
      const { c } = db
        .prepare(
          `SELECT COUNT(*) AS c FROM habit_logs hl
           JOIN habit_definitions hd ON hd.id = hl.habit_id
           WHERE hd.subscription_id = ? AND hl.done = 1`
        )
        .get(subId);
      return c >= 10;
    },
  },
  first_workout_plan: {
    icon: '🏋️',
    label_ar: 'أول برنامج تمرين',
    label_en: 'First Workout Plan',
    check: (subId) => {
      const row = db.prepare('SELECT days_json FROM workout_plans WHERE subscription_id = ?').get(subId);
      if (!row) return false;
      try { return JSON.parse(row.days_json).length > 0; } catch { return false; }
    },
  },
  first_progress_photo: {
    icon: '📸',
    label_ar: 'أول صورة تقدم',
    label_en: 'First Progress Photo',
    check: (subId) => {
      const { c } = db
        .prepare('SELECT COUNT(*) AS c FROM progress_entries WHERE subscription_id = ? AND photo_path IS NOT NULL')
        .get(subId);
      return c >= 1;
    },
  },
  ten_sessions: {
    icon: '🏆',
    label_ar: '10 جلسات مكتملة',
    label_en: '10 Completed Sessions',
    check: (subId) => {
      const { c } = db
        .prepare("SELECT COUNT(*) AS c FROM booked_sessions WHERE subscription_id = ? AND status = 'completed'")
        .get(subId);
      return c >= 10;
    },
  },
};

// Checks every badge for this subscription and awards any newly-earned ones
// to both the trainee and the coach on that subscription. Cheap enough to
// call after any activity write (few small indexed queries).
function checkAndAwardBadges(subscriptionId) {
  const sub = db.prepare('SELECT trainee_id, coach_id FROM subscriptions WHERE id = ?').get(subscriptionId);
  if (!sub) return [];
  const newlyAwarded = [];
  const insert = db.prepare(
    'INSERT OR IGNORE INTO badges_earned (subscription_id, user_id, badge_key) VALUES (?, ?, ?)'
  );
  for (const [key, badge] of Object.entries(BADGES)) {
    if (!badge.check(subscriptionId)) continue;
    for (const userId of [sub.trainee_id, sub.coach_id]) {
      const info = insert.run(subscriptionId, userId, key);
      if (info.changes > 0) newlyAwarded.push({ userId, key });
    }
  }
  return newlyAwarded;
}

function listEarnedBadges(subscriptionId, userId) {
  const rows = db
    .prepare('SELECT badge_key, earned_at FROM badges_earned WHERE subscription_id = ? AND user_id = ?')
    .all(subscriptionId, userId);
  return rows.map((r) => ({ ...BADGES[r.badge_key], key: r.badge_key, earned_at: r.earned_at }));
}

module.exports = { BADGES, checkAndAwardBadges, listEarnedBadges };
