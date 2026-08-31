// نسخة احتياطية يومية للـ SQLite على نفس الـ volume. ده بيحمي من باگ في
// الكود أو migration غلط بيبوظ الداتا، لكن مش حماية حقيقية "off-site" -
// لو الـ volume نفسه ضاع، النسخ الاحتياطية بتضيع معاه. لحماية حقيقية
// محتاجين نرفع نسخة بره Railway (S3 أو أي تخزين خارجي) بشكل دوري.
const fs = require('fs');
const path = require('path');

const dbDir = process.env.DATA_DIR || path.join(__dirname, '..', 'db');
const backupDir = path.join(dbDir, 'backups');
const KEEP_DAYS = 7;

function cleanupOld() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(backupDir)) {
    const full = path.join(backupDir, file);
    if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
  }
}

async function runBackup(db) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const dest = path.join(backupDir, `traino-${stamp}.sqlite`);
  try {
    await db.backup(dest);
    console.log('✅ نسخة احتياطية اتعملت:', dest);
    cleanupOld();
  } catch (err) {
    console.log('⚠️ فشل عمل نسخة احتياطية:', err.message);
  }
}

function scheduleDailyBackup(db) {
  runBackup(db);
  setInterval(() => runBackup(db), 24 * 60 * 60 * 1000);
}

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const stat = fs.statSync(path.join(backupDir, f));
      return { name: f, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Only ever resolves inside backupDir, and only to a name that's actually
// one of ours - blocks path traversal via the filename param.
function resolveBackupPath(name) {
  if (!/^traino-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name)) return null;
  const full = path.join(backupDir, name);
  return fs.existsSync(full) ? full : null;
}

module.exports = { scheduleDailyBackup, listBackups, resolveBackupPath };
