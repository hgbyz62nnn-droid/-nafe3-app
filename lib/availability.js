const db = require('../db');

// كل حسابات التاريخ/الوقت هنا بتوقيت UTC عمدًا، عشان تتوافق مع
// scheduled_at المخزّن بصيغة toISOString() (UTC) ومع دوال SQLite
// date()/time() اللي بتفترض UTC برضو - أي خلط بين توقيت محلي وUTC هنا
// كان هيسبب اختلاف يوم/ساعة حسب توقيت السيرفر.

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// لو الكوتش لسه مظبطش جدوله الأسبوعي، بنرجع لسلوك الحجز الحر القديم (أي
// معاد مستقبلي) عشان الحجز مايتكسرش - مطابق لتعليمة "Only show real
// available slots if backend availability exists".
function hasAvailabilityConfigured(coachId) {
  return !!db.prepare('SELECT 1 FROM coach_availability WHERE coach_id = ? LIMIT 1').get(coachId);
}

// بيحسب الفترات المتاحة الحقيقية ليوم معيّن (YYYY-MM-DD): الجدول
// الأسبوعي لليوم ده مقسّم لشرائح (مدة الجلسة + وقت راحة)، ناقص أي يوم
// إجازة مستثنى، وناقص أي معاد محجوز فعلًا لنفس الكوتش في نفس اليوم،
// وناقص أي وقت فات لو التاريخ المطلوب هو النهاردة.
function computeAvailableSlots(coachId, dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return [];
  const date = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(date.getTime())) return [];

  const blocked = db.prepare('SELECT 1 FROM coach_blocked_dates WHERE coach_id = ? AND blocked_date = ?').get(coachId, dateStr);
  if (blocked) return [];

  const dayOfWeek = date.getUTCDay();
  const windows = db.prepare('SELECT start_time, end_time FROM coach_availability WHERE coach_id = ? AND day_of_week = ?').all(coachId, dayOfWeek);
  if (windows.length === 0) return [];

  const profile = db.prepare('SELECT session_duration_minutes, buffer_minutes FROM coach_profiles WHERE user_id = ?').get(coachId);
  const duration = profile?.session_duration_minutes || 60;
  const buffer = profile?.buffer_minutes || 0;
  const step = duration + buffer;

  const bookedRows = db
    .prepare(
      `SELECT bs.scheduled_at FROM booked_sessions bs
       JOIN subscriptions s ON s.id = bs.subscription_id
       WHERE s.coach_id = ? AND bs.status = 'scheduled' AND date(bs.scheduled_at) = ?`
    )
    .all(coachId, dateStr);
  const bookedMinutes = new Set(
    bookedRows.map((r) => {
      const d = new Date(r.scheduled_at);
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    })
  );

  const now = new Date();
  const isToday = dateStr === now.toISOString().slice(0, 10);
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  const slots = [];
  for (const w of windows) {
    let start = timeToMinutes(w.start_time);
    const end = timeToMinutes(w.end_time);
    while (start + duration <= end) {
      if (!(isToday && start <= nowMinutes) && !bookedMinutes.has(start)) {
        slots.push(minutesToTime(start));
      }
      start += step;
    }
  }
  return slots.sort();
}

// بيحوّل {date, time} أو scheduled_at (ISO) لتاريخ JS واحد موحّد -
// المصدر اللي الفرونت إند هيبعته بيختلف حسب لو الكوتش عنده جدول متاح أو
// لأ (شوف routes/sessions.js).
function parseRequestedDateTime(body) {
  if (body.date && body.time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !/^\d{2}:\d{2}$/.test(body.time)) return null;
    const d = new Date(`${body.date}T${body.time}:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  if (body.scheduled_at) {
    const d = new Date(body.scheduled_at);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

module.exports = { hasAvailabilityConfigured, computeAvailableSlots, timeToMinutes, minutesToTime, parseRequestedDateTime };
