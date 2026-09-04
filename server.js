const app = require('./app');
const db = require('./db');
const { scheduleDailyBackup } = require('./lib/backup');
const { scheduleSessionReminders } = require('./lib/sessionReminders');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Traino server running: http://localhost:${PORT}`);
  scheduleDailyBackup(db);
  scheduleSessionReminders();
});
