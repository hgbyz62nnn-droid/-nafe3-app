const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = process.env.DATA_DIR || path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'nafe3.sqlite'));
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

db.exec(`
CREATE TABLE IF NOT EXISTS flagged_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  message TEXT NOT NULL,
  reasons TEXT NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

try { db.exec("ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN avatar TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN gallery TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN verify_code TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN verify_expires TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE subscriptions ADD COLUMN client_number INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE subscriptions ADD COLUMN commission_rate REAL"); } catch (e) {}
try { db.exec("ALTER TABLE subscriptions ADD COLUMN commission_amount INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE subscriptions ADD COLUMN coach_payout INTEGER"); } catch (e) {}

db.exec(`
-- خطط التمرين والتغذية: خطة واحدة نشطة لكل اشتراك، الكوتش بيعدّلها والمتدرب بيشوفها.
-- الأيام/التمارين والوجبات متخزنة كـ JSON عشان تبسيط الفورم بدل جداول متداخلة.
CREATE TABLE IF NOT EXISTS workout_plans (
  subscription_id INTEGER PRIMARY KEY REFERENCES subscriptions(id),
  title TEXT,
  days_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nutrition_plans (
  subscription_id INTEGER PRIMARY KEY REFERENCES subscriptions(id),
  daily_calories INTEGER,
  notes TEXT,
  meals_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS progress_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  weight_kg REAL,
  photo_path TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habit_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habit_definitions(id),
  log_date TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 1,
  UNIQUE(habit_id, log_date)
);

CREATE TABLE IF NOT EXISTS badges_earned (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  badge_key TEXT NOT NULL,
  earned_at TEXT DEFAULT (datetime('now')),
  UNIQUE(subscription_id, user_id, badge_key)
);

CREATE TABLE IF NOT EXISTS booked_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
  notes TEXT,
  reminder_24h_sent INTEGER NOT NULL DEFAULT 0,
  reminder_1h_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- تذاكر الدعم الفني: بتتفتح من المتدرب أو الكوتش، وبيرد عليها الأدمن من
-- نفس لوحة التحكم الحالية (مش نظام تاني منفصل).
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK(category IN ('payment','booking','account','trainer','technical','report','other')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','waiting_user','resolved','closed')),
  subject TEXT NOT NULL,
  user_last_seen_at TEXT DEFAULT (datetime('now')),
  admin_last_seen_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id),
  sender_type TEXT NOT NULL CHECK(sender_type IN ('user','admin')),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- تقييم واحد لكل اشتراك، بس بعد ما يكون فيه جلسة مكتملة على الأقل.
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL UNIQUE REFERENCES subscriptions(id),
  coach_id INTEGER NOT NULL REFERENCES users(id),
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  coach_response TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- جاليري صور عامة/خاصة لأي يوزر (كوتش أو متدرب)، منفصلة عن صورة البروفايل.
CREATE TABLE IF NOT EXISTS gallery_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  photo_path TEXT NOT NULL,
  caption TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private')),
  created_at TEXT DEFAULT (datetime('now'))
);
`);

try { db.exec("ALTER TABLE users ADD COLUMN avatar_path TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT"); } catch (e) {}

module.exports = db;
