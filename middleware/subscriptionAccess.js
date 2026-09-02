const db = require('../db');

// Loads the subscription and checks the logged-in user is one of its two
// parties (trainee or coach) and it's active; attaches it as req.sub and
// req.isCoach. Used by every feature scoped to a subscription (plans,
// progress, habits, sessions) so access rules stay in one place.
function requireSubscriptionParty(req, res, next) {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.subscriptionId);
  if (!sub) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  if (sub.trainee_id !== req.user.id && sub.coach_id !== req.user.id) {
    return res.status(403).json({ error: 'مش معاك صلاحية' });
  }
  if (sub.status !== 'active') return res.status(403).json({ error: 'الاشتراك مش نشط' });
  req.sub = sub;
  req.isCoach = sub.coach_id === req.user.id;
  next();
}

module.exports = { requireSubscriptionParty };
