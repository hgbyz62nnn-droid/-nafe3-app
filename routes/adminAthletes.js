const express = require('express');
const db = require('../db');
const { requireAdmin, requirePermission } = require('../middleware/adminAuth');

const router = express.Router();

// Read-only admin visibility into an athlete's real, persisted context
// (spec: Super Admin §6) - built ONLY from data this platform actually
// stores. This backend's data model is a coach-assigns-a-plan trainer
// marketplace, not the separate client-only TRAINO deterministic Coaching
// Engine rebuild (which has no server and never sends its assessment
// answers - sport, position, competitive level, matches/week, readiness,
// travel/competition - anywhere): that engine's fields are NOT surfaced
// here because they don't exist in this database. What IS real and shown
// below: each coach's own custom intake assessment (assessment_templates/
// assessment_questions/client_assessments), the workout/nutrition plan the
// coach built, logged progress, habits, badges, and check-ins.
router.use(requireAdmin);

router.get('/', requirePermission('athletes', 'view'), (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const params = [];
  let where = "WHERE u.role = 'trainee'";
  if (q) { where += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  const trainees = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.banned, u.verified, u.created_at,
         (SELECT s.id FROM subscriptions s WHERE s.trainee_id = u.id ORDER BY s.created_at DESC LIMIT 1) AS latest_subscription_id,
         (SELECT s.status FROM subscriptions s WHERE s.trainee_id = u.id ORDER BY s.created_at DESC LIMIT 1) AS latest_subscription_status,
         (SELECT c.name FROM subscriptions s JOIN users c ON c.id = s.coach_id WHERE s.trainee_id = u.id ORDER BY s.created_at DESC LIMIT 1) AS latest_coach_name
       FROM users u ${where} ORDER BY u.id DESC LIMIT 200`
    )
    .all(...params);
  res.json({ trainees });
});

router.get('/:subscriptionId', requirePermission('athletes', 'view'), (req, res) => {
  const subscriptionId = req.params.subscriptionId;
  const subscription = db
    .prepare(
      `SELECT s.*, t.name AS trainee_name, t.email AS trainee_email, c.name AS coach_name, c.email AS coach_email
       FROM subscriptions s JOIN users t ON t.id = s.trainee_id JOIN users c ON c.id = s.coach_id
       WHERE s.id = ?`
    )
    .get(subscriptionId);
  if (!subscription) return res.status(404).json({ error: 'الاشتراك غير موجود' });

  // Intake assessment - answers matched up against the coach's own question
  // labels (not raw question ids) so the admin can actually read them.
  const clientAssessment = db.prepare('SELECT * FROM client_assessments WHERE subscription_id = ?').get(subscriptionId);
  let assessment = null;
  if (clientAssessment) {
    const questions = db
      .prepare('SELECT * FROM assessment_questions WHERE template_id = ? ORDER BY sort_order ASC')
      .all(clientAssessment.template_id);
    const answers = JSON.parse(clientAssessment.answers_json || '{}');
    const extraQuestions = JSON.parse(clientAssessment.extra_questions_json || '[]');
    const extraAnswers = JSON.parse(clientAssessment.extra_answers_json || '{}');
    assessment = {
      submittedAt: clientAssessment.submitted_at,
      answers: questions.map((q) => ({ section: q.section, label: q.label, type: q.type, answer: answers[q.id] ?? null })),
      extraAnswers: extraQuestions.map((q, i) => ({ label: q.label ?? q, answer: extraAnswers[i] ?? null })),
    };
  }

  const workoutPlan = db.prepare('SELECT * FROM workout_plans WHERE subscription_id = ?').get(subscriptionId);
  const nutritionPlan = db.prepare('SELECT * FROM nutrition_plans WHERE subscription_id = ?').get(subscriptionId);
  const progressEntries = db
    .prepare('SELECT id, weight_kg, note, created_at FROM progress_entries WHERE subscription_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(subscriptionId);
  const habits = db
    .prepare('SELECT id, label, active FROM habit_definitions WHERE subscription_id = ?')
    .all(subscriptionId)
    .map((h) => {
      const recentDone = db
        .prepare("SELECT COUNT(*) c FROM habit_logs WHERE habit_id = ? AND done = 1 AND log_date >= date('now', '-30 days')")
        .get(h.id).c;
      return { ...h, doneLast30Days: recentDone };
    });
  const badges = db.prepare('SELECT badge_key, earned_at FROM badges_earned WHERE subscription_id = ?').all(subscriptionId);
  const checkIns = db
    .prepare(
      `SELECT id, weight_kg, body_fat_pct, energy_level, sleep_hours, training_adherence_pct, diet_adherence_pct, status, created_at
       FROM check_ins WHERE subscription_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(subscriptionId);
  const transformationCount = db.prepare('SELECT COUNT(*) c FROM transformations WHERE subscription_id = ?').get(subscriptionId).c;

  res.json({
    subscription,
    assessment,
    workoutPlan: workoutPlan ? { title: workoutPlan.title, days: JSON.parse(workoutPlan.days_json || '[]'), updatedAt: workoutPlan.updated_at } : null,
    nutritionPlan: nutritionPlan
      ? { dailyCalories: nutritionPlan.daily_calories, notes: nutritionPlan.notes, meals: JSON.parse(nutritionPlan.meals_json || '[]'), updatedAt: nutritionPlan.updated_at }
      : null,
    progressEntries,
    habits,
    badges,
    checkIns,
    transformationCount,
  });
});

module.exports = router;
