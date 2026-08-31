require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const coachRoutes = require('./routes/coaches');
const subscriptionRoutes = require('./routes/subscriptions');
const chatRoutes = require('./routes/chat');
const adminAuthRoutes = require('./routes/adminAuth');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
// dotfiles 'allow' so /.well-known/assetlinks.json (needed for the Android
// TWA app to verify it owns this domain) isn't silently 404'd.
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'allow' }));

app.use('/api/auth', authRoutes);
app.use('/api/coaches', coachRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminAuthRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Traino server running: http://localhost:${PORT}`);
});
