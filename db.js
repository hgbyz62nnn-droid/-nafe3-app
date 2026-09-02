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

-- نفس فكرة workout_templates بالظبط بس لخطة التغذية - كيان منفصل مش مربوط
-- بأي اشتراك معيّن، الكوتش يقدر يطبّقه على أي متدرب.
CREATE TABLE IF NOT EXISTS nutrition_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  daily_calories INTEGER,
  protein_target INTEGER,
  carbs_target INTEGER,
  fat_target INTEGER,
  notes TEXT,
  meals_json TEXT NOT NULL DEFAULT '[]',
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

-- كود إعادة تعيين كلمة المرور (6 أرقام)، بنفس منطق verify_code/verify_expires
-- الموجود في users لتأكيد التسجيل، بس في جدول منفصل عشان نقدر نحتفظ
-- بتاريخ الطلبات القديمة (لحساب معدل الطلبات لكل إيميل) بدل ما نمسحها.
-- attempts بيتصفر مع كل كود جديد ويوقف الكود عن الشغل بعد 5 محاولات غلط
-- حتى لو لسه في وقته، عشان محدش يقدر يخمّن الكود بالتجربة.
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
`);

try { db.exec("ALTER TABLE users ADD COLUMN avatar_path TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT"); } catch (e) {}
// بيتزود بواحد مع كل إعادة تعيين كلمة مرور ناجحة - أي JWT قديم بيحمل رقم
// نسخة أقدم من اللي في القاعدة بيترفض فورًا (middleware/auth.js)، يعني
// أي جلسة دخول مفتوحة قبل إعادة التعيين بتتقفل تلقائيًا. مفيش حاجة تانية
// في التطبيق بتعدّل password_hash غير التسجيل وده، فمفيش مكان تاني محتاج
// يزوّد الرقم ده.
try { db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"); } catch (e) {}
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

// مكتبة التمارين - نفس فكرة trainer_documents: كيان معزول تمامًا، مش
// مربوط بأي منطق موجود بالفعل في routes/plans.js. coach_id = NULL معناها
// تمرين عام من مكتبة النظام (متاح لكل الكوتشات)، وأي قيمة تانية معناها
// تمرين مخصص أضافه كوتش معيّن ومش ظاهر لغيره. برنامج التمرين (days_json في
// workout_plans) بيفضل يخزن اسم التمرين كنص زي ما هو دايمًا - exercise_id
// مجرد رابط اختياري إضافي لو الكوتش اختار التمرين من المكتبة، فأي بيانات
// قديمة أو نص حر يفضل شغال زي ما هو من غير أي تغيير.
db.exec(`
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  muscle_group TEXT,
  equipment TEXT,
  difficulty TEXT,
  video_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_exercises_coach ON exercises(coach_id);

CREATE TABLE IF NOT EXISTS exercise_favorites (
  coach_id INTEGER NOT NULL REFERENCES users(id),
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (coach_id, exercise_id)
);
`);

// اتضافوا بعد إطلاق مكتبة التمارين - Exercise Type وMovement Pattern
// المطلوبين في المواصفة كفلاتر مكتبة/معايير تبديل تمرين (Swap Exercise).
try { db.exec("ALTER TABLE exercises ADD COLUMN exercise_type TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE exercises ADD COLUMN movement_pattern TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE exercises ADD COLUMN instructions TEXT"); } catch (e) {}

// تزريع مكتبة تمارين عامة مرة واحدة بس - لو الجدول فاضي (قاعدة جديدة أو
// أول نشر بعد إضافة الميزة دي). لو فيه تمارين بالفعل (تمارين مخصصة أضافها
// كوتش حقيقي قبل التزريع ده) منعملش حاجة، عشان منكررش التزريع مع كل تشغيل.
// Exercise Type (compound/isolation) وMovement Pattern لكل تمرين من
// الـ48 تمرين المزروعين - تصنيف رياضي معروف مش أرقام مخترعة، ومستخدم في
// الزرع الأول وفي ترقيع أي قاعدة قديمة زرعت قبل إضافة العمودين دول (تحت).
// تمارين الكارديو الأربعة اتسابت من غير حركة نمطية واحدة تمثلها بدقة.
const EXERCISE_CLASSIFICATIONS = {
  'بنش برس بار': ['compound', 'push', 'استلقِ على البنش، أمسك البار بعرض أوسع من الكتف قليلًا، وانزله للصدر ثم ادفعه لأعلى بثبات.'],
  'بنش برس دمبل': ['compound', 'push', 'استلقِ على البنش ممسكًا دمبلين عند الصدر، وادفعهم لأعلى حتى تمديد شبه كامل للذراعين.'],
  'بنش برس مايل بار': ['compound', 'push', 'زي البنش برس العادي بس على بنش مائل 30-45 درجة لتركيز أكبر على أعلى الصدر.'],
  'بنش برس مايل دمبل': ['compound', 'push', 'دمبلين على بنش مائل، انزلهم لجانبي أعلى الصدر وادفعهم لأعلى مع تحكم.'],
  'تفتيح دمبل': ['isolation', 'push', 'استلقِ ممسكًا دمبلين فوق الصدر بمرفقين مثنيين قليلًا، وافتحهم للجانبين ثم ارجع لنقطة البداية.'],
  'كابل كروس أوفر': ['isolation', 'push', 'واقف بين بكرتين، اجذب المقابض لبعضهم أمام الصدر مع الحفاظ على انحناءة بسيطة في المرفق.'],
  'بار متوازي (تريسبس/صدر)': ['compound', 'push', 'على البار المتوازي، انزل جسمك بميل للأمام لتركيز الصدر وادفع لأعلى.'],
  'بوش أب': ['compound', 'push', 'وضع البلانك، انزل الصدر نحو الأرض بمرفقين قريبين من الجسم وادفع لأعلى.'],
  'بك سكوات': ['compound', 'squat', 'البار على أعلى الظهر، انزل الحوض للخلف والأسفل مع إبقاء الصدر مرفوع، ثم اقف.'],
  'فرونت سكوات': ['compound', 'squat', 'البار على مقدمة الأكتاف، انزل بوضعية مستقيمة أكثر من السكوات الخلفي.'],
  'ليج بريس': ['compound', 'squat', 'اجلس على الجهاز وادفع اللوح بالقدمين حتى تمديد شبه كامل للركبتين من غير قفل كامل.'],
  'لانجز دمبل': ['compound', 'lunge', 'خطوة للأمام مع دمبلين بجانبك، انزل حتى تصل الركبة الخلفية قريبة من الأرض ثم ارجع.'],
  'رومانيان ديدليفت': ['compound', 'hinge', 'انحنِ من الحوض مع ركبتين شبه مستقيمتين، أنزل البار قريبًا من الساقين ثم اقف.'],
  'ليج إكستنشن': ['isolation', 'extension', 'اجلس على الجهاز ومد الركبتين لأعلى ضد المقاومة ثم أنزلهم بتحكم.'],
  'ليج كيرل': ['isolation', 'flexion', 'استلقِ أو اجلس على الجهاز واثنِ الركبتين لجذب الوزن للخلف.'],
  'هيب ثرست بار': ['compound', 'hinge', 'ظهرك مسند على بنش والبار فوق الحوض، ادفع الحوض لأعلى حتى استقامة الجسم.'],
  'كالف رايز واقف': ['isolation', 'extension', 'واقف، ارفع الكعبين لأعلى قدر الإمكان ثم أنزلهم بتحكم.'],
  'بلغاريان سبليت سكوات': ['compound', 'lunge', 'قدم خلفية مرفوعة على بنش، انزل بالساق الأمامية حتى زاوية قريبة من 90 درجة.'],
  'ديدليفت تقليدي': ['compound', 'hinge', 'امسك البار من الأرض بظهر مستقيم واقف بدفع الأرض بقدميك حتى الوقوف الكامل.'],
  'سحب أرضي (بار)': ['compound', 'pull', 'انحنِ للأمام بظهر مستقيم واسحب البار نحو أسفل الصدر مع الضغط على لوحي الكتف.'],
  'سحب أرضي دمبل': ['compound', 'pull', 'يد وركبة على البنش، اسحب الدمبل بيدك التانية نحو الخصر.'],
  'بول أب': ['compound', 'pull', 'تعلق من البار بقبضة أوسع من الكتف واسحب جسمك لأعلى حتى يتخطى الذقن البار.'],
  'لات بول داون': ['compound', 'pull', 'اجلس واسحب البار لأسفل نحو أعلى الصدر مع فتح لوحي الكتف.'],
  'سحب كابل جلوس': ['compound', 'pull', 'اجلس واسحب المقبض نحو البطن مع تثبيت الظهر مستقيم.'],
  'تي بار رو': ['compound', 'pull', 'انحنِ للأمام واسحب البار نحو أسفل الصدر بقبضة ثابتة.'],
  'هايبر إكستنشن': ['isolation', 'extension', 'على جهاز الهايبر، انزل الجذع للأمام ثم مدّه لأعلى حتى استقامة الظهر.'],
  'أوفرهيد برس بار': ['compound', 'push', 'واقف، ادفع البار من أعلى الكتفين لأعلى الرأس حتى تمديد كامل للذراعين.'],
  'أوفرهيد برس دمبل': ['compound', 'push', 'دمبلين عند الكتفين، ادفعهم لأعلى حتى تمديد شبه كامل.'],
  'رفرفة جانبية دمبل': ['isolation', 'push', 'ارفع الدمبلين للجانبين حتى مستوى الكتف مع ثني بسيط في المرفق.'],
  'رفرفة أمامية دمبل': ['isolation', 'push', 'ارفع الدمبلين للأمام حتى مستوى الكتف ثم أنزلهم بتحكم.'],
  'رفرفة خلفية دمبل': ['isolation', 'pull', 'انحنِ للأمام وارفع الدمبلين للجانبين مع التركيز على مؤخرة الكتف.'],
  'فيس بول': ['isolation', 'pull', 'اسحب الحبل نحو الوجه مع فتح المرفقين للخارج للخلف.'],
  'شراج بار': ['isolation', 'pull', 'امسك البار وارفع الكتفين لأعلى نحو الأذنين ثم أنزلهم.'],
  'بايسبس كيرل بار': ['isolation', 'flexion', 'امسك البار بقبضة سفلية واثنِ المرفقين لرفعه نحو الصدر.'],
  'بايسبس كيرل دمبل': ['isolation', 'flexion', 'ارفع الدمبلين بثني المرفقين مع تثبيت الكتفين.'],
  'هامر كيرل': ['isolation', 'flexion', 'زي البايسبس كيرل بس بقبضة محايدة (الإبهام لأعلى).'],
  'تريسبس بوش داون كابل': ['isolation', 'extension', 'ادفع الحبل لأسفل حتى تمديد كامل للمرفقين مع تثبيتهم بجانب الجسم.'],
  'تريسبس اكستنشن دمبل': ['isolation', 'extension', 'دمبل خلف الرأس، مد المرفقين لأعلى حتى استقامة الذراعين.'],
  'ديبس': ['compound', 'push', 'على البار المتوازي، انزل الجسم بمرفقين قريبين للتركيز على الترايسبس وادفع لأعلى.'],
  'بلانك': ['isolation', 'anti_rotation', 'وضعية الدفع على المرفقين مع تثبيت الجسم مستقيم من الكتف للكاحل.'],
  'كرانش': ['isolation', 'flexion', 'استلقِ وارفع أعلى الظهر عن الأرض بثني البطن من غير سحب الرقبة.'],
  'رفع أرجل معلق': ['isolation', 'flexion', 'تعلق من البار وارفع الأرجل لأعلى مع تثبيت الجذع.'],
  'روسي تويست': ['isolation', 'rotation', 'اجلس بميل خلفي بسيط ولف الجذع لليمين واليسار بالتبادل.'],
  'أب ويل': ['compound', 'anti_rotation', 'من الركوع، ادفع العجلة للأمام مع تثبيت البطن ثم ارجع.'],
  'جري خفيف': [null, null, 'جري بوتيرة ثابتة ومريحة للتنفس، مناسب للإحماء أو الكارديو الخفيف.'],
  'جامبينج جاك': [null, null, 'قفزات بفتح الأرجل والذراعين معًا ثم إغلاقهم بالتبادل.'],
  'بيربيز': ['compound', null, 'انزل لوضع البلانك، ارجع سريعًا، ثم اقفز لأعلى - حركة كارديو مركّبة لكل الجسم.'],
  'نط الحبل': [null, null, 'نط بالحبل بوتيرة ثابتة مع قفزات خفيفة على مقدمة القدم.'],
};

const exerciseCount = db.prepare('SELECT COUNT(*) c FROM exercises').get().c;
if (exerciseCount === 0) {
  const insertExercise = db.prepare(
    'INSERT INTO exercises (coach_id, name, muscle_group, equipment, difficulty, exercise_type, movement_pattern, instructions) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)'
  );
  const seedExercises = [
    ['بنش برس بار', 'chest', 'barbell', 'intermediate'],
    ['بنش برس دمبل', 'chest', 'dumbbell', 'beginner'],
    ['بنش برس مايل بار', 'chest', 'barbell', 'intermediate'],
    ['بنش برس مايل دمبل', 'chest', 'dumbbell', 'intermediate'],
    ['تفتيح دمبل', 'chest', 'dumbbell', 'beginner'],
    ['كابل كروس أوفر', 'chest', 'cable', 'intermediate'],
    ['بار متوازي (تريسبس/صدر)', 'chest', 'bodyweight', 'advanced'],
    ['بوش أب', 'chest', 'bodyweight', 'beginner'],
    ['بك سكوات', 'legs', 'barbell', 'intermediate'],
    ['فرونت سكوات', 'legs', 'barbell', 'advanced'],
    ['ليج بريس', 'legs', 'machine', 'beginner'],
    ['لانجز دمبل', 'legs', 'dumbbell', 'beginner'],
    ['رومانيان ديدليفت', 'legs', 'barbell', 'intermediate'],
    ['ليج إكستنشن', 'legs', 'machine', 'beginner'],
    ['ليج كيرل', 'legs', 'machine', 'beginner'],
    ['هيب ثرست بار', 'legs', 'barbell', 'intermediate'],
    ['كالف رايز واقف', 'legs', 'machine', 'beginner'],
    ['بلغاريان سبليت سكوات', 'legs', 'dumbbell', 'advanced'],
    ['ديدليفت تقليدي', 'back', 'barbell', 'advanced'],
    ['سحب أرضي (بار)', 'back', 'barbell', 'intermediate'],
    ['سحب أرضي دمبل', 'back', 'dumbbell', 'beginner'],
    ['بول أب', 'back', 'bodyweight', 'advanced'],
    ['لات بول داون', 'back', 'cable', 'beginner'],
    ['سحب كابل جلوس', 'back', 'cable', 'beginner'],
    ['تي بار رو', 'back', 'barbell', 'intermediate'],
    ['هايبر إكستنشن', 'back', 'bodyweight', 'beginner'],
    ['أوفرهيد برس بار', 'shoulders', 'barbell', 'intermediate'],
    ['أوفرهيد برس دمبل', 'shoulders', 'dumbbell', 'beginner'],
    ['رفرفة جانبية دمبل', 'shoulders', 'dumbbell', 'beginner'],
    ['رفرفة أمامية دمبل', 'shoulders', 'dumbbell', 'beginner'],
    ['رفرفة خلفية دمبل', 'shoulders', 'dumbbell', 'beginner'],
    ['فيس بول', 'shoulders', 'cable', 'intermediate'],
    ['شراج بار', 'shoulders', 'barbell', 'intermediate'],
    ['بايسبس كيرل بار', 'arms', 'barbell', 'beginner'],
    ['بايسبس كيرل دمبل', 'arms', 'dumbbell', 'beginner'],
    ['هامر كيرل', 'arms', 'dumbbell', 'beginner'],
    ['تريسبس بوش داون كابل', 'arms', 'cable', 'beginner'],
    ['تريسبس اكستنشن دمبل', 'arms', 'dumbbell', 'beginner'],
    ['ديبس', 'arms', 'bodyweight', 'advanced'],
    ['بلانك', 'core', 'bodyweight', 'beginner'],
    ['كرانش', 'core', 'bodyweight', 'beginner'],
    ['رفع أرجل معلق', 'core', 'bodyweight', 'advanced'],
    ['روسي تويست', 'core', 'bodyweight', 'beginner'],
    ['أب ويل', 'core', 'bodyweight', 'advanced'],
    ['جري خفيف', 'cardio', 'bodyweight', 'beginner'],
    ['جامبينج جاك', 'cardio', 'bodyweight', 'beginner'],
    ['بيربيز', 'cardio', 'bodyweight', 'intermediate'],
    ['نط الحبل', 'cardio', 'bodyweight', 'beginner'],
  ];
  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      const [exType, pattern, instructions] = EXERCISE_CLASSIFICATIONS[r[0]] || [null, null, null];
      insertExercise.run(r[0], r[1], r[2], r[3], exType, pattern, instructions);
    }
  });
  insertMany(seedExercises);
} else {
  // ترقيع القواعد اللي اتزرعت قبل إضافة exercise_type/movement_pattern/
  // instructions - تمارين النظام العامة بس (coach_id NULL) واللي لسه
  // فاضية في العمودين الأولانيين، عشان منلمسش أي تمرين مخصص كوتش عدّله.
  const updateClassification = db.prepare(
    `UPDATE exercises SET exercise_type = ?, movement_pattern = ?, instructions = ?
     WHERE coach_id IS NULL AND name = ? AND (exercise_type IS NULL OR movement_pattern IS NULL OR instructions IS NULL)`
  );
  const backfill = db.transaction(() => {
    for (const [name, [exType, pattern, instructions]] of Object.entries(EXERCISE_CLASSIFICATIONS)) {
      if (exType || pattern || instructions) updateClassification.run(exType, pattern, instructions, name);
    }
  });
  backfill();
}

// مكتبة الأطعمة - نفس فكرة مكتبة التمارين بالظبط: كيان معزول، مش مربوط
// بمنطق sanitizeFoods الحالي. القيم بالجرام لكل 100 جرام من الطعام، وبيتم
// حساب القيم الفعلية حسب الكمية وقت الاختيار في الواجهة - صف الأكلة في
// nutrition_plans (meals_json) لسه بيخزن أرقام مطلقة زي ما هو دايمًا،
// food_id مجرد رابط اختياري إضافي زي exercise_id بالظبط.
db.exec(`
CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT,
  calories_per_100g REAL NOT NULL DEFAULT 0,
  protein_per_100g REAL NOT NULL DEFAULT 0,
  carbs_per_100g REAL NOT NULL DEFAULT 0,
  fat_per_100g REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_foods_coach ON foods(coach_id);

CREATE TABLE IF NOT EXISTS food_favorites (
  coach_id INTEGER NOT NULL REFERENCES users(id),
  food_id INTEGER NOT NULL REFERENCES foods(id),
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (coach_id, food_id)
);
`);

const foodCount = db.prepare('SELECT COUNT(*) c FROM foods').get().c;
if (foodCount === 0) {
  const insertFood = db.prepare(
    'INSERT INTO foods (coach_id, name, category, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g) VALUES (NULL, ?, ?, ?, ?, ?, ?)'
  );
  const seedFoods = [
    ['صدور فراخ مشوية', 'protein', 165, 31, 0, 3.6],
    ['فراخ مسلوقة', 'protein', 150, 28, 0, 3.2],
    ['لحم بقري نايف', 'protein', 250, 26, 0, 15],
    ['لحمة مفرومة 90%', 'protein', 176, 20, 0, 10],
    ['سمك بلطي', 'protein', 96, 20, 0, 1.7],
    ['سمك سلمون', 'protein', 208, 20, 0, 13],
    ['تونة في ماء', 'protein', 116, 26, 0, 1],
    ['بيض كامل', 'protein', 155, 13, 1.1, 11],
    ['بياض بيض', 'protein', 52, 11, 0.7, 0.2],
    ['جبنة قريش', 'dairy', 98, 11, 3.4, 4.3],
    ['زبادي يوناني', 'dairy', 59, 10, 3.6, 0.4],
    ['لبن خالي الدسم', 'dairy', 42, 3.4, 5, 0.1],
    ['جبنة موتزاريلا', 'dairy', 280, 28, 3.1, 17],
    ['أرز أبيض مسلوق', 'carb', 130, 2.7, 28, 0.3],
    ['أرز بني مسلوق', 'carb', 111, 2.6, 23, 0.9],
    ['شوفان جاف', 'carb', 389, 17, 66, 7],
    ['بطاطس مسلوقة', 'carb', 87, 1.9, 20, 0.1],
    ['بطاطا حلوة مسلوقة', 'carb', 86, 1.6, 20, 0.1],
    ['خبز أسمر', 'carb', 247, 13, 41, 3.4],
    ['خبز بلدي', 'carb', 275, 9, 55, 1.6],
    ['مكرونة مسلوقة', 'carb', 158, 5.8, 31, 0.9],
    ['كينوا مسلوقة', 'carb', 120, 4.4, 21, 1.9],
    ['شوفان مطبوخ', 'carb', 71, 2.5, 12, 1.5],
    ['موز', 'fruit', 89, 1.1, 23, 0.3],
    ['تفاح', 'fruit', 52, 0.3, 14, 0.2],
    ['برتقال', 'fruit', 47, 0.9, 12, 0.1],
    ['فراولة', 'fruit', 32, 0.7, 8, 0.3],
    ['بروكلي مسلوق', 'vegetable', 35, 2.4, 7, 0.4],
    ['خيار', 'vegetable', 15, 0.7, 3.6, 0.1],
    ['طماطم', 'vegetable', 18, 0.9, 3.9, 0.2],
    ['سبانخ', 'vegetable', 23, 2.9, 3.6, 0.4],
    ['جزر', 'vegetable', 41, 0.9, 10, 0.2],
    ['خس', 'vegetable', 15, 1.4, 2.9, 0.2],
    ['لوز', 'fat', 579, 21, 22, 50],
    ['زبدة فول سوداني', 'fat', 588, 25, 20, 50],
    ['زيت زيتون', 'fat', 884, 0, 0, 100],
    ['أفوكادو', 'fat', 160, 2, 9, 15],
    ['جوز', 'fat', 654, 15, 14, 65],
    ['عدس مسلوق', 'protein', 116, 9, 20, 0.4],
    ['فول مدمس', 'protein', 110, 7.6, 18, 0.6],
    ['حمص مسلوق', 'protein', 164, 9, 27, 2.6],
  ];
  const insertManyFoods = db.transaction((rows) => { for (const r of rows) insertFood.run(...r); });
  insertManyFoods(seedFoods);
}

// نظام التقييم (Assessment) - كل مرة الكوتش يحفظ فيها القالب الافتراضي
// بتاعه بيتعمل صف جديد بـ version أعلى (is_current=1) بدل ما نعدّل الصف
// القديم - عشان تقييمات المتدربين اللي خدت نسخة قديمة تفضل زي ما هي
// للأبد (assessment_questions مرتبطة بـ template_id ثابت، مش بآخر نسخة).
// أسئلة إضافية خاصة بمتدرب معيّن بتتخزن في client_assessments نفسها
// (extra_questions_json) عشان محدش يلمس القالب الافتراضي بتاع باقي المتدربين.
db.exec(`
CREATE TABLE IF NOT EXISTS assessment_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(coach_id, version)
);
CREATE INDEX IF NOT EXISTS idx_assessment_templates_coach ON assessment_templates(coach_id);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES assessment_templates(id),
  section TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  required INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_template ON assessment_questions(template_id);

CREATE TABLE IF NOT EXISTS client_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL UNIQUE REFERENCES subscriptions(id),
  template_id INTEGER NOT NULL REFERENCES assessment_templates(id),
  answers_json TEXT NOT NULL DEFAULT '{}',
  extra_questions_json TEXT NOT NULL DEFAULT '[]',
  extra_answers_json TEXT NOT NULL DEFAULT '{}',
  submitted_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_client_assessments_template ON client_assessments(template_id);
`);

module.exports = db;
