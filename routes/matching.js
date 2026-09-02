const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { GOALS, EXPERIENCE_LEVELS, TRAINING_TYPES, computeCompatibility } = require('../lib/matching');

const router = express.Router();

router.get('/options', (req, res) => {
  res.json({ goals: GOALS, experienceLevels: EXPERIENCE_LEVELS, trainingTypes: TRAINING_TYPES });
});

router.post('/find-trainer', requireAuth, requireRole('trainee'), (req, res) => {
  const goal = GOALS.includes(req.body.goal) ? req.body.goal : null;
  if (!goal) return res.status(400).json({ error: 'اختار هدفك الأول' });
  const experience = EXPERIENCE_LEVELS.includes(req.body.experience) ? req.body.experience : null;
  const trainingType = TRAINING_TYPES.includes(req.body.trainingType) ? req.body.trainingType : null;
  const budgetNum = Number(req.body.budget);
  const budget = Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : null;
  const location = String(req.body.location ?? '').trim().slice(0, 100) || null;

  const coaches = db
    .prepare(
      `SELECT u.id, u.name, u.verified, u.avatar_path,
         c.specialty, c.location, c.price_1m, c.price_3m, c.price_6m,
         c.goals_json, c.training_types_json, c.experience_levels_json,
         (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE coach_id = u.id AND hidden = 0) AS avg_rating,
         (SELECT COUNT(*) FROM reviews WHERE coach_id = u.id AND hidden = 0) AS review_count,
         (SELECT COUNT(*) FROM subscriptions WHERE coach_id = u.id AND status IN ('active','expired')) AS client_count
       FROM coach_profiles c JOIN users u ON u.id = c.user_id
       WHERE c.status = 'approved'
         AND u.id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = ?)
         AND u.id NOT IN (SELECT blocker_id FROM blocked_users WHERE blocked_id = ?)`
    )
    .all(req.user.id, req.user.id);

  const answers = { goal, experience, trainingType, budget, location };
  const matches = coaches
    .map((c) => ({
      id: c.id,
      name: c.name,
      verified: c.verified,
      avatar_path: c.avatar_path,
      specialty: c.specialty,
      location: c.location,
      price_1m: c.price_1m,
      avg_rating: c.avg_rating,
      review_count: c.review_count,
      client_count: c.client_count,
      compatibilityPct: computeCompatibility(c, answers),
    }))
    .sort((a, b) => b.compatibilityPct - a.compatibilityPct || (b.avg_rating || 0) - (a.avg_rating || 0))
    .slice(0, 20);

  res.json({ matches });
});

module.exports = router;
