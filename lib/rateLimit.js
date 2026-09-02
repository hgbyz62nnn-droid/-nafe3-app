const rateLimit = require('express-rate-limit');

// Per-IP limiter for the admin login - single high-value account, so this
// is the main defense against brute force there.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كتير غلط، جرب تاني بعد شوية' },
});

// Per-IP limiter for account creation / verification emails, so one IP
// can't spam the Resend quota or hammer the DB with fake accounts.
const emailActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كتير، جرب تاني بعد شوية' },
});

module.exports = { adminLoginLimiter, emailActionLimiter };
