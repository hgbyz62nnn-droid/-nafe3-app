// فلتر بيكشف محاولات مشاركة أرقام موبايل أو حسابات تواصل جوه الشات،
// حتى لو المستخدم حاول يتحايل عليه (مسافات بين الأرقام، أرقام عربي، أرقام
// بالحروف، حروف شبيهة بصريًا زي O/l، أو توزيع الرقم على أكتر من رسالة).

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const AR_NUMBER_WORDS = {
  'صفر': '0',
  'واحد': '1', 'واحدة': '1', 'واحده': '1',
  'اتنين': '2', 'إتنين': '2', 'اثنين': '2', 'إثنين': '2',
  'تلاتة': '3', 'تلاته': '3', 'ثلاثة': '3', 'ثلاثه': '3',
  'اربعة': '4', 'اربعه': '4', 'أربعة': '4', 'أربعه': '4',
  'خمسة': '5', 'خمسه': '5',
  'ستة': '6', 'سته': '6', 'ست': '6',
  'سبعة': '7', 'سبعه': '7',
  'تمانية': '8', 'تمانيه': '8', 'ثمانية': '8', 'ثمانيه': '8',
  'تسعة': '9', 'تسعه': '9',
};

const EN_NUMBER_WORDS = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

const DIGIT_RUN_RE = /[0-9oOlI](?:[\s\-.,_#/|]{0,3}[0-9oOlI])*/g;
const PHONE_DIGIT_THRESHOLD = 8;

function normalizeArabicDigits(text) {
  return text
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_INDIC_DIGITS.indexOf(d)));
}

function wordsToDigits(text) {
  return text
    .split(/([\s,._\-#/|]+)/)
    .map((token) => {
      if (!token) return token;
      if (token.startsWith('و') && token.length > 1 && AR_NUMBER_WORDS[token.slice(1)]) {
        return AR_NUMBER_WORDS[token.slice(1)];
      }
      if (AR_NUMBER_WORDS[token]) return AR_NUMBER_WORDS[token];
      const lower = token.toLowerCase();
      if (EN_NUMBER_WORDS[lower]) return EN_NUMBER_WORDS[lower];
      return token;
    })
    .join('');
}

function normalizeForDigitScan(rawText) {
  return normalizeArabicDigits(wordsToDigits(rawText));
}

function cleanDigitRun(run) {
  return run.replace(/[^0-9oOlI]/g, '').replace(/[oO]/g, '0').replace(/[lI]/g, '1');
}

function hasLongDigitRun(normalizedText) {
  const matches = normalizedText.match(DIGIT_RUN_RE) || [];
  return matches.some((m) => cleanDigitRun(m).length >= PHONE_DIGIT_THRESHOLD);
}

function extractDigits(normalizedText) {
  return (normalizedText.match(/[0-9oOlI]/g) || [])
    .join('')
    .replace(/[oO]/g, '0')
    .replace(/[lI]/g, '1');
}

// رسالة "مسيطر عليها بالأرقام" - قصيرة ومعظمها أرقام أو حروف شبيهة بيها،
// زي لما حد بيبعت جزء من رقم موبايل في رسالة لوحدها.
function isDigitDominant(normalizedText) {
  const stripped = normalizedText.replace(/\s+/g, '');
  if (!stripped) return false;
  const digitLikeCount = (stripped.match(/[0-9oOlI]/g) || []).length;
  return stripped.length <= 20 && digitLikeCount / stripped.length >= 0.6;
}

const SOCIAL_PATTERNS = [
  { type: 'whatsapp', re: /(wa\.me\/|api\.whatsapp\.com|whatsapp|واتساب|واتسابي|واتسابى|واتس ?اب|واتس)/i },
  { type: 'telegram', re: /(t\.me\/|telegram|تيليجرام|تليجرام)/i },
  { type: 'instagram', re: /(instagram\.com|instagr\.am|انستا|انستجرام|إنستجرام)/i },
  { type: 'facebook', re: /(facebook\.com|fb\.com|fb\.me|فيسبوك|فيس ?بوك)/i },
  { type: 'tiktok', re: /(tiktok\.com|تيك ?توك)/i },
  { type: 'snapchat', re: /(snapchat\.com|snapchat|سناب ?شات|سناب)/i },
  { type: 'handle', re: /@[a-zA-Z0-9_.]{3,}/ },
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const EXIT_INTENT_PATTERNS = [
  /بر[ةه] (ال)?تطبيق/,
  /بر[ةه] (ال)?منص[ةه]/,
  /خارج (ال)?تطبيق/,
  /خارج (ال)?منص[ةه]/,
  /كمل(ي)? (الكلام|الحديث) بر[ةه]/,
  /نكمل بر[ةه]/,
  /نتكلم بر[ةه]/,
  /هبعتلك رقمي/,
  /هكلمك بر[ةه]/,
  /تواصل مباشر/,
  /منص[ةه] تاني[ةه]?/,
  /\boutside the app\b/i,
  /\boff[\s-]?platform\b/i,
  /\bcontact me (directly|elsewhere)\b/i,
  /\bmessage me on\b/i,
  /\badd me on\b/i,
  /\blet'?s talk elsewhere\b/i,
];

// تحليل رسالة واحدة لوحدها (من غير سياق الرسائل اللي قبلها).
function analyzeMessage(rawText) {
  const reasons = new Set();
  const normalized = normalizeForDigitScan(rawText);

  if (hasLongDigitRun(normalized)) reasons.add('phone_number');
  for (const { type, re } of SOCIAL_PATTERNS) {
    if (re.test(rawText)) reasons.add(`social:${type}`);
  }
  if (EMAIL_RE.test(rawText)) reasons.add('email');
  for (const re of EXIT_INTENT_PATTERNS) {
    if (re.test(rawText)) { reasons.add('exit_intent'); break; }
  }

  return { flagged: reasons.size > 0, reasons: [...reasons] };
}

// تحليل الرسالة الحالية مع آخر كام رسالة من نفس الشخص، عشان نمسك محاولة
// تقسيم رقم الموبايل على أكتر من رسالة.
function analyzeWithHistory(currentText, recentTexts = []) {
  const base = analyzeMessage(currentText);
  const reasons = new Set(base.reasons);

  const currentNormalized = normalizeForDigitScan(currentText);
  let combinedDigits = extractDigits(currentNormalized);
  for (let i = recentTexts.length - 1; i >= 0; i--) {
    const norm = normalizeForDigitScan(recentTexts[i]);
    if (!isDigitDominant(norm)) break;
    combinedDigits = extractDigits(norm) + combinedDigits;
  }
  if (combinedDigits.length >= PHONE_DIGIT_THRESHOLD && !reasons.has('phone_number')) {
    reasons.add('phone_number_split');
  }

  return { flagged: reasons.size > 0, reasons: [...reasons] };
}

// الأسباب دي بتوقف الرسالة تمامًا. "exit_intent" لوحده بيتسجّل للمراجعة
// من غير ما يمنع الرسالة، عشان مفيش دليل تواصل فعلي فيها.
function isHardReason(reason) {
  return reason !== 'exit_intent';
}

function shouldBlock(reasons) {
  return reasons.some(isHardReason);
}

// للتوافق مع أي كود قديم بيستخدم الاسم القديم.
function containsContactInfo(text) {
  return shouldBlock(analyzeMessage(text).reasons);
}

module.exports = { analyzeMessage, analyzeWithHistory, shouldBlock, containsContactInfo };
