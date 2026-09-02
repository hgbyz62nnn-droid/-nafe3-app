const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { listEarnedBadges, checkAndAwardBadges } = require('../lib/badges');

const router = express.Router();

router.get('/:subscriptionId', requireAuth, requireSubscriptionParty, (req, res) => {
  checkAndAwardBadges(req.sub.id);
  res.json({ badges: listEarnedBadges(req.sub.id, req.user.id) });
});

module.exports = router;
