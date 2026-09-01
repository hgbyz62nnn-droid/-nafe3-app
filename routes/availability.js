const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { computeAvailableSlots, timeToMinutes } = require('../lib/availability');

const router = express.Router();

const MAX_WINDOWS = 40;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeWindows(days) {
  if (!Array.isArray(days)) return null;
  if (days.length > MAX_WINDOWS) return null;
  const out = [];
  for (const d of days) {
    const dayOfWeek = Number(d?.day_of_week);
    const startTime = String(d?.start_time ?? '');
    const endTime = String(d?.end_time ?? '');
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null;
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return null;
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) return null;
    out.push({ day_of_week: dayOfWeek, start_time: startTime, end_time: endTime });
  }
  return out;
}

// -------------------- الكوتش يظبط جدوله --------------------

router.get('/me', requireAuth, requireRole('coach'), (req, res) => {
  const schedule = db.prepare('SELECT id, day_of_week, start_time, end_time FROM coach_availability WHERE coach_id = ? ORDER BY day_of_week, start_time').all(req.user.id);
  const blockedDates = db.prepare('SELECT id, blocked_date, reason FROM coach_blocked_dates WHERE coach_id = ? ORDER BY blocked_date').all(req.user.id);
  const profile = db.prepare('SELECT session_duration_minutes, buffer_minutes FROM coach_profiles WHERE user_id = ?').get(req.user.id);
  res.json({ schedule, blockedDates, settings: profile || { session_duration_minutes: 60, buffer_minutes: 0 } });
});

router.put('/me/schedule', requireAuth, requireRole('coach'), (req, res) => {
  const windows = sanitizeWindows(req.body.windows);
  if (!windows) return res.status(400).json({ error: 'جدول المواعيد غير صحيح' });
  const run = db.transaction(() => {
    db.prepare('DELETE FROM coach_availability WHERE coach_id = ?').run(req.user.id);
    const insert = db.prepare('INSERT INTO coach_availability (coach_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)');
    windows.forEach((w) => insert.run(req.user.id, w.day_of_week, w.start_time, w.end_time));
  });
  run();
  res.json({ ok: true });
});

router.put('/me/settings', requireAuth, requireRole('coach'), (req, res) => {
  const duration = Number(req.body.session_duration_minutes);
  const buffer = Number(req.body.buffer_minutes);
  if (!Number.isInteger(duration) || duration < 15 || duration > 240) return res.status(400).json({ error: 'مدة الجلسة لازم تكون بين 15 و240 دقيقة' });
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 120) return res.status(400).json({ error: 'وقت الراحة لازم يكون بين 0 و120 دقيقة' });
  db.prepare('UPDATE coach_profiles SET session_duration_minutes = ?, buffer_minutes = ? WHERE user_id = ?').run(duration, buffer, req.user.id);
  res.json({ ok: true });
});

router.post('/me/blocked-dates', requireAuth, requireRole('coach'), (req, res) => {
  const date = String(req.body.date ?? '');
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'تاريخ غير صحيح' });
  const reason = String(req.body.reason ?? '').trim().slice(0, 100) || null;
  const count = db.prepare('SELECT COUNT(*) c FROM coach_blocked_dates WHERE coach_id = ?').get(req.user.id).c;
  if (count >= 200) return res.status(400).json({ error: 'وصلت للحد الأقصى من الأيام المستثناة' });
  db.prepare('INSERT INTO coach_blocked_dates (coach_id, blocked_date, reason) VALUES (?, ?, ?)').run(req.user.id, date, reason);
  res.json({ ok: true });
});

router.delete('/me/blocked-dates/:id', requireAuth, requireRole('coach'), (req, res) => {
  const row = db.prepare('SELECT * FROM coach_blocked_dates WHERE id = ?').get(req.params.id);
  if (!row || row.coach_id !== req.user.id) return res.status(404).json({ error: 'غير موجود' });
  db.prepare('DELETE FROM coach_blocked_dates WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// -------------------- عامة: الفترات المتاحة الحقيقية ليوم معيّن --------------------

router.get('/:coachId/slots', (req, res) => {
  const coachId = Number(req.params.coachId);
  if (!coachId) return res.status(400).json({ error: 'كوتش غير صحيح' });
  const date = String(req.query.date ?? '');
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'تاريخ غير صحيح' });
  const hasSchedule = !!db.prepare('SELECT 1 FROM coach_availability WHERE coach_id = ? LIMIT 1').get(coachId);
  if (!hasSchedule) return res.json({ hasSchedule: false, slots: [] });
  res.json({ hasSchedule: true, slots: computeAvailableSlots(coachId, date) });
});

module.exports = router;
