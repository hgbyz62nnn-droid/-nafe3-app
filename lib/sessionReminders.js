const db = require('../db');
const { sendBroadcastEmail } = require('./email');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function sendDueReminders() {
  const windows = [
    { column: 'reminder_24h_sent', fromHours: 23, toHours: 25, label_ar: 'بكرة الساعة كده', label_en: 'tomorrow around this time' },
    { column: 'reminder_1h_sent', fromHours: 0.75, toHours: 1.25, label_ar: 'خلال ساعة', label_en: 'in about an hour' },
  ];

  for (const win of windows) {
    const due = db
      .prepare(
        `SELECT bs.*, t.name AS trainee_name, t.email AS trainee_email, c.name AS coach_name, c.email AS coach_email
         FROM booked_sessions bs
         JOIN subscriptions s ON s.id = bs.subscription_id
         JOIN users t ON t.id = s.trainee_id
         JOIN users c ON c.id = s.coach_id
         WHERE bs.status = 'scheduled' AND bs.${win.column} = 0
           AND bs.scheduled_at BETWEEN datetime('now', '+${win.fromHours} hours') AND datetime('now', '+${win.toHours} hours')`
      )
      .all();

    for (const session of due) {
      const when = new Date(session.scheduled_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
      try {
        await sendBroadcastEmail(
          session.trainee_email,
          'تذكير بجلستك مع مدربك - Traino',
          `مرحبًا ${session.trainee_name}،<br>عندك جلسة مع ${session.coach_name} ${win.label_ar} (${when}).`
        );
        await sendBroadcastEmail(
          session.coach_email,
          'تذكير بجلسة مع متدربك - Traino',
          `مرحبًا ${session.coach_name}،<br>عندك جلسة مع ${session.trainee_name} ${win.label_ar} (${when}).`
        );
      } catch (e) {
        console.log('⚠️ فشل إرسال تذكير الجلسة:', e.message);
      }
      db.prepare(`UPDATE booked_sessions SET ${win.column} = 1 WHERE id = ?`).run(session.id);
    }
  }
}

function scheduleSessionReminders() {
  setInterval(() => { sendDueReminders().catch((e) => console.log('⚠️ خطأ في فحص تذكيرات الجلسات:', e.message)); }, CHECK_INTERVAL_MS);
}

module.exports = { scheduleSessionReminders, sendDueReminders };
