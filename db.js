const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(__dirname, 'db', 'nafe3.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('trainee','coach','admin')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coach_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  specialty TEXT,
  bio TEXT,
  certification TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  price_1m INTEGER DEFAULT 0,
  price_3m INTEGER DEFAULT 0,
  price_6m INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  coach_id INTEGER NOT NULL REFERENCES users(id),
  package TEXT NOT NULL CHECK(package IN ('1m','3m','6m')),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','active','expired','cancelled')),
  payment_ref TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

try { db.exec("ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN avatar TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN gallery TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN verify_code TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN verify_expires TEXT"); } catch (e) {}

module.exports = db;
