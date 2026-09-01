const db = require('../db');
const { deleteUploadedFile } = require('./media');

// حذف نهائي وكامل لحساب مستخدم وكل بياناته المرتبطة عبر كل الجداول
// (اشتراكات، رسايل، خطط، تقدم، عادات، إنجازات، جلسات، تقييمات، تذاكر
// دعم، صور جاليري/بروفايل/تحولات، حظر وبلاغات). نقطة واحدة مستخدمة من
// حذف الأدمن اليدوي للمستخدمين ومن الموافقة على طلبات حذف الحساب،
// عشان الاتنين يستخدموا بالظبط نفس منطق الحذف.
function deleteUserAccount(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return false;

  const subIds = db
    .prepare('SELECT id FROM subscriptions WHERE trainee_id = ? OR coach_id = ?')
    .all(userId, userId)
    .map((r) => r.id);

  const filesToDelete = [];
  if (user.avatar_path) filesToDelete.push(user.avatar_path);
  db.prepare('SELECT photo_path FROM gallery_photos WHERE user_id = ?').all(userId)
    .forEach((r) => filesToDelete.push(r.photo_path));
  if (subIds.length) {
    const placeholders = subIds.map(() => '?').join(',');
    db.prepare(`SELECT before_photo_path, after_photo_path FROM transformations WHERE subscription_id IN (${placeholders})`)
      .all(...subIds)
      .forEach((r) => { filesToDelete.push(r.before_photo_path); filesToDelete.push(r.after_photo_path); });
  }

  const run = db.transaction(() => {
    if (subIds.length) {
      const placeholders = subIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM messages WHERE subscription_id IN (${placeholders})`).run(...subIds);
      db.prepare(`DELETE FROM workout_plans WHERE subscription_id IN (${placeholders})`).run(...subIds);
      db.prepare(`DELETE FROM nutrition_plans WHERE subscription_id IN (${placeholders})`).run(...subIds);
      db.prepare(`DELETE FROM progress_entries WHERE subscription_id IN (${placeholders})`).run(...subIds);
      db.prepare(`DELETE FROM habit_logs WHERE habit_id IN (SELECT id FROM habit_definitions WHERE subscription_id IN (${placeholders}))`).run(...subIds);
      db.prepare(`DELETE FROM habit_definitions WHERE subscription_id IN (${placeholders})`).run(...subIds);
      db.prepare(`DELETE FROM badges_earned WHERE subscription_id IN (${placeholders})`).run(...subIds);
      db.prepare(`DELETE FROM booked_sessions WHERE subscription_id IN (${placeholders})`).run(...subIds);
      db.prepare(`DELETE FROM reviews WHERE subscription_id IN (${placeholders})`).run(...subIds);
      db.prepare(`DELETE FROM transformations WHERE subscription_id IN (${placeholders})`).run(...subIds);
      db.prepare(`DELETE FROM flagged_attempts WHERE subscription_id IN (${placeholders})`).run(...subIds);
    }
    db.prepare('DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM support_tickets WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM flagged_attempts WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM gallery_photos WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM blocked_users WHERE blocker_id = ? OR blocked_id = ?').run(userId, userId);
    db.prepare('DELETE FROM user_reports WHERE reporter_id = ? OR reported_id = ?').run(userId, userId);
    db.prepare('DELETE FROM subscriptions WHERE trainee_id = ? OR coach_id = ?').run(userId, userId);
    db.prepare('DELETE FROM coach_profiles WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
  run();

  filesToDelete.forEach((f) => deleteUploadedFile(f));
  return true;
}

module.exports = { deleteUserAccount };
