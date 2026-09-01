require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const db = require('./db');
const { scheduleDailyBackup } = require('./lib/backup');
const { uploadsDir } = require('./lib/paths');
const { scheduleSessionReminders } = require('./lib/sessionReminders');
const authRoutes = require('./routes/auth');
const coachRoutes = require('./routes/coaches');
const subscriptionRoutes = require('./routes/subscriptions');
const chatRoutes = require('./routes/chat');
const adminAuthRoutes = require('./routes/adminAuth');
const planRoutes = require('./routes/plans');
const progressRoutes = require('./routes/progress');
const habitRoutes = require('./routes/habits');
const sessionRoutes = require('./routes/sessions');
const coachStatsRoutes = require('./routes/coachStats');
const badgeRoutes = require('./routes/badges');
const supportRoutes = require('./routes/support');
const reviewRoutes = require('./routes/reviews');
const mediaRoutes = require('./routes/media');
const transformationRoutes = require('./routes/transformations');
const moderationRoutes = require('./routes/moderation');
const accountDeletionRequestRoutes = require('./routes/accountDeletionRequests');
const trainerDocumentRoutes = require('./routes/trainerDocuments');
const checkinRoutes = require('./routes/checkins');
const availabilityRoutes = require('./routes/availability');
const matchingRoutes = require('./routes/matching');

const app = express();

// Railway terminates TLS at its edge and forwards plain HTTP internally;
// trust proxy so req.secure / x-forwarded-proto reflect the real client.
app.set('trust proxy', 1);

// Force HTTPS whenever we can tell (via the edge's x-forwarded-proto) that
// the original request came in over plain HTTP. Skipped when the header is
// absent (local dev, or a healthcheck hitting the container directly).
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});

app.use(
  helmet({
    // Google Fonts doesn't send Cross-Origin-Resource-Policy headers, which
    // COEP would otherwise use to block its stylesheet/font requests.
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // 'unsafe-inline' is needed for the many inline style="" attributes
        // the UI renders; low-risk compared to allowing inline scripts,
        // which stay locked to 'self' above.
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);

const ALLOWED_ORIGINS = ['https://nafe3-app-production.up.railway.app'];
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: same-origin page loads, curl, and server-to-server
      // calls (e.g. the Paymob webhook) - CORS doesn't apply to these anyway.
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());
// dotfiles 'allow' so /.well-known/assetlinks.json (needed for the Android
// TWA app to verify it owns this domain) isn't silently 404'd.
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'allow' }));
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRoutes);
app.use('/api/coaches', coachRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminAuthRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/coach-stats', coachStatsRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/transformations', transformationRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/account-deletion', accountDeletionRequestRoutes);
app.use('/api/trainer-documents', trainerDocumentRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/matching', matchingRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/privacy-policy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html')));
app.get('/delete-account', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delete-account.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Traino server running: http://localhost:${PORT}`);
  scheduleDailyBackup(db);
  scheduleSessionReminders();
});
