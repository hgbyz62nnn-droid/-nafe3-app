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

-- قوالب برامج تمرين جاهزة للكوتش، عشان يبدأ منها بدل ما يكتب كل حاجة من
-- الأول لكل متدرب جديد. نفس شكل days_json بتاع workout_plans بالظبط.
CREATE TABLE IF NOT EXISTS workout_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  days_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
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
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled','no_show')),
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

-- بلاغ عن تقييم معيّن (مش عن مستخدم بشكل عام زي user_reports) - غالبًا
-- الكوتش اللي اتقيّم هو اللي بيبلّغ عن تقييم مسيء/غير حقيقي، عشان الأدمن
-- يراجعه ويقرر يخفيه أو يتجاهله.
CREATE TABLE IF NOT EXISTS review_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL REFERENCES reviews(id),
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','action_taken')),
  admin_action TEXT,
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

-- زوج صور "قبل/بعد" بيضيفه الكوتش لمتدرب معيّن. ثلاث حالات ظهور:
-- private (الكوتش بس)، client_only (الكوتش والمتدرب - الافتراضي)، public
-- (يظهر في البروفايل العام). عمدًا مينفعش visibility='public' لوحدها
-- تنشر الصورة - لازم permission_status = 'granted' كمان (موافقة صريحة من
-- المتدرب) عشان مفيش نشر تلقائي لصور متدرب من غير علمه أبدًا.
CREATE TABLE IF NOT EXISTS transformations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  coach_id INTEGER NOT NULL REFERENCES users(id),
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  before_photo_path TEXT NOT NULL,
  after_photo_path TEXT NOT NULL,
  duration_label TEXT,
  goal TEXT,
  notes TEXT,
  weight_change REAL,
  body_fat_change REAL,
  testimonial TEXT,
  visibility TEXT NOT NULL DEFAULT 'client_only' CHECK(visibility IN ('private','client_only','public')),
  permission_status TEXT NOT NULL DEFAULT 'not_requested' CHECK(permission_status IN ('not_requested','pending','granted','declined')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- حظر متبادل بين مستخدمين: بعد الحظر مايقدروش يبعتوا رسايل لبعض، ومايظهروش
-- لبعض في نتائج البحث/التصفح. blocker_id هو اللي حظر، blocked_id هو المحظور.
CREATE TABLE IF NOT EXISTS blocked_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blocker_id INTEGER NOT NULL REFERENCES users(id),
  blocked_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(blocker_id, blocked_id)
);

-- بلاغات المستخدمين عن بعض، بتظهر في لوحة تحكم الأدمن عشان تتراجع ويتاخد
-- إجراء (تجاهل / تحذير بإيميل / حظر الحساب بالكامل عبر users.banned).
CREATE TABLE IF NOT EXISTS user_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  reported_id INTEGER NOT NULL REFERENCES users(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  reason TEXT NOT NULL CHECK(reason IN ('harassment','fraud','inappropriate','impersonation','other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','action_taken')),
  admin_action TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- طلبات حذف الحساب: صفحة عامة من غير تسجيل دخول، بيراجعها الأدمن ويوافق
-- عليها (يحذف الحساب فعليًا) أو يرفضها. مربوطة بالإيميل مش بـ user_id
-- عشان لسه صالحة حتى لو الحساب اتحذف بالفعل أو الإيميل مش مطابق لحساب حقيقي.
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','rejected')),
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);

-- مستندات/شهادات المدرب (بطاقة، شهادة تدريب، إلخ) - خاصة تمامًا، بتتخزن في
-- مجلد منفصل عن uploads العام مش متاح كـ static، وبتتقرا بس عبر route
-- مصرح ليه (صاحب المستند أو الأدمن). مش جزء من البروفايل العام أبدًا.
CREATE TABLE IF NOT EXISTS trainer_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  doc_type TEXT NOT NULL CHECK(doc_type IN ('id','certification','other')),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  review_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT
);

-- طلب تعديل على بروفايل مدرب معتمد بالفعل: البيانات دي مسودة مش هتتطبق
-- على coach_profiles (النسخة العامة الظاهرة للمتدربين) إلا لما الأدمن
-- يوافق. الـ index الجزئي تحت بيضمن طلب pending واحد بس لكل مدرب في نفس
-- الوقت - أي حفظ جديد وهو لسه في المراجعة بيعدّل نفس الصف مش يعمل صف جديد.
CREATE TABLE IF NOT EXISTS coach_profile_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  specialty TEXT,
  bio TEXT,
  certification TEXT,
  price_1m INTEGER,
  price_3m INTEGER,
  price_6m INTEGER,
  gender TEXT CHECK(gender IN ('male','female') OR gender IS NULL),
  location TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  review_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_pending_edit ON coach_profile_edits(coach_id) WHERE status = 'pending';

-- تقييمات دورية (Check-ins) من المتدرب للكوتش: منفصلة تمامًا عن نظام
-- progress_entries/habit_logs الحالي (تتبع يومي). دي بيانات دورية أشمل
-- (وزن، دهون، قياسات، صورة، مستوى طاقة، نوم، التزام بالتمرين والدايت،
-- ملاحظات) بيراجعها الكوتش ويضيف ملاحظاته عليها.
CREATE TABLE IF NOT EXISTS check_ins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  weight_kg REAL,
  body_fat_pct REAL,
  measurements_json TEXT NOT NULL DEFAULT '{}',
  photo_path TEXT,
  energy_level INTEGER,
  sleep_hours REAL,
  training_adherence_pct INTEGER,
  diet_adherence_pct INTEGER,
  trainee_notes TEXT,
  coach_notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewed')),
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_checkins_subscription ON check_ins(subscription_id);

-- الجدول الأسبوعي الثابت لمواعيد الكوتش (مثال: كل يوم أحد من 5 لـ 9 مساءً).
-- day_of_week زي JS's Date.getDay(): 0=الأحد لغاية 6=السبت.
CREATE TABLE IF NOT EXISTS coach_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_availability_coach ON coach_availability(coach_id);

-- أيام مستثناة من الجدول الأسبوعي (إجازة، يوم مشغول استثنائيًا).
CREATE TABLE IF NOT EXISTS coach_blocked_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  blocked_date TEXT NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blocked_dates_coach ON coach_blocked_dates(coach_id);

-- متابعة مدرب لمدرب تاني (Trainer Network) - follower هو اللي بيتابع،
-- followed هو اللي بيتتابع. مقصود بسيط (follow/unfollow بس) من غير أي
-- تعقيد اجتماعي زيادة (فيد، إشعارات، إلخ) زي ما السبك الأصلي طلب.
CREATE TABLE IF NOT EXISTS trainer_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL REFERENCES users(id),
  followed_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(follower_id, followed_id)
);
CREATE INDEX IF NOT EXISTS idx_trainer_follows_follower ON trainer_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_trainer_follows_followed ON trainer_follows(followed_id);

-- محتوى بسيط ينشره المدربين (نصايح، محتوى تعليمي، تمارين، تحفيز،
-- إعلانات). hidden للأدمن يقدر يخفي منشور مسيء بعد النشر - مفيش مراجعة
-- قبل النشر لأنه مش بيانات هوية/سعر حساسة، بس النص بيعدي على نفس فلتر
-- الخصوصية المستخدم في باقي النصوص الحرة في التطبيق قبل ما يتحفظ.
CREATE TABLE IF NOT EXISTS trainer_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK(category IN ('tip','educational','exercise','transformation','motivation','announcement')),
  content TEXT NOT NULL,
  photo_path TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trainer_posts_coach ON trainer_posts(coach_id);
CREATE INDEX IF NOT EXISTS idx_trainer_posts_created ON trainer_posts(created_at);

CREATE TABLE IF NOT EXISTS post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES trainer_posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);

CREATE TABLE IF NOT EXISTS post_saves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES trainer_posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_saves_post ON post_saves(post_id);
CREATE INDEX IF NOT EXISTS idx_post_saves_user ON post_saves(user_id);
`);

try { db.exec("ALTER TABLE users ADD COLUMN avatar_path TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN gender TEXT CHECK(gender IN ('male','female') OR gender IS NULL)"); } catch (e) {}
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN location TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE subscriptions ADD COLUMN trainee_last_seen_at TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE subscriptions ADD COLUMN coach_last_seen_at TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE nutrition_plans ADD COLUMN protein_target INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE nutrition_plans ADD COLUMN carbs_target INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE nutrition_plans ADD COLUMN fat_target INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN session_duration_minutes INTEGER NOT NULL DEFAULT 60"); } catch (e) {}
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN buffer_minutes INTEGER NOT NULL DEFAULT 0"); } catch (e) {}
// وسوم مطابقة المدرب (Find My Trainer) - بيانات اكتشاف بسيطة يقدر المدرب
// يعدّلها بنفسه فورًا من غير مراجعة أدمن (زي مواعيده تمامًا)، عكس
// specialty/bio/price اللي هي بيانات هوية/سعر حساسة وعدّيلها بيمر بمراجعة.
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN goals_json TEXT NOT NULL DEFAULT '[]'"); } catch (e) {}
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN training_types_json TEXT NOT NULL DEFAULT '[]'"); } catch (e) {}
try { db.exec("ALTER TABLE coach_profiles ADD COLUMN experience_levels_json TEXT NOT NULL DEFAULT '[]'"); } catch (e) {}

// SQLite مبيسمحش تعدّل CHECK constraint في مكانها بـ ALTER TABLE، فلازم
// نعيد إنشاء الجدول لما نوسّع visibility من (public/private) لـ
// (private/client_only/public) ونضيف الأعمدة الجديدة. الـ guard هنا بيتأكد
// إن ده بيحصل مرة واحدة بس على أي قاعدة قديمة لسه شايلة الـ constraint
// القديم - قاعدة جديدة أصلًا بتتعمل بالشكل الجديد من CREATE TABLE فوق.
// صفوف 'private' القديمة كانت فعليًا معناها "يشوفها الكوتش والمتدرب بس
// مش عامة"، فبتترحّل لـ 'client_only' عشان الشكل يفضل زي ما هو للمتدربين
// اللي شايفين تحولاتهم دلوقتي. صفوف 'public' القديمة كانت بالفعل ظاهرة
// عامة، فبتترحّل بـ permission_status='granted' عشان الترحيل ميخبيش
// حاجة كانت ظاهرة فعليًا لمختبرين حقيقيين دلوقتي.
const transformationsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transformations'").get();
if (transformationsTableSql && !transformationsTableSql.sql.includes('client_only')) {
  db.exec(`
    ALTER TABLE transformations RENAME TO transformations_old;
    CREATE TABLE transformations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
      coach_id INTEGER NOT NULL REFERENCES users(id),
      trainee_id INTEGER NOT NULL REFERENCES users(id),
      before_photo_path TEXT NOT NULL,
      after_photo_path TEXT NOT NULL,
      duration_label TEXT,
      goal TEXT,
      notes TEXT,
      weight_change REAL,
      body_fat_change REAL,
      testimonial TEXT,
      visibility TEXT NOT NULL DEFAULT 'client_only' CHECK(visibility IN ('private','client_only','public')),
      permission_status TEXT NOT NULL DEFAULT 'not_requested' CHECK(permission_status IN ('not_requested','pending','granted','declined')),
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO transformations (id, subscription_id, coach_id, trainee_id, before_photo_path, after_photo_path, duration_label, goal, notes, visibility, permission_status, created_at)
      SELECT id, subscription_id, coach_id, trainee_id, before_photo_path, after_photo_path, duration_label, goal, notes,
        CASE visibility WHEN 'private' THEN 'client_only' ELSE visibility END,
        CASE WHEN visibility = 'public' THEN 'granted' ELSE 'not_requested' END,
        created_at
      FROM transformations_old;
    DROP TABLE transformations_old;
  `);
}

// نفس أسلوب إعادة الإنشاء المحروسة فوق - بنوسّع status عشان تقبل 'no_show'
// (جلسة المتدرب متغيبش عنها من غير إلغاء)، القيم القديمة تفضل زي ما هي.
const bookedSessionsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='booked_sessions'").get();
if (bookedSessionsSql && !bookedSessionsSql.sql.includes('no_show')) {
  db.exec(`
    ALTER TABLE booked_sessions RENAME TO booked_sessions_old;
    CREATE TABLE booked_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled','no_show')),
      notes TEXT,
      reminder_24h_sent INTEGER NOT NULL DEFAULT 0,
      reminder_1h_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO booked_sessions SELECT * FROM booked_sessions_old;
    DROP TABLE booked_sessions_old;
  `);
}

module.exports = db;
