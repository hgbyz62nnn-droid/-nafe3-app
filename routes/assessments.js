const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireSubscriptionParty } = require('../middleware/subscriptionAccess');
const { clampStr, toNullableNumber } = require('../lib/sanitize');
const { saveGalleryPhoto } = require('../lib/media');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const SECTIONS = ['general_info', 'training_background', 'health_medical', 'lifestyle', 'goals', 'measurements', 'notes'];
const QUESTION_TYPES = ['single_choice', 'multiple_choice', 'yes_no', 'number', 'short_text', 'long_text', 'date', 'measurement', 'image_upload'];
const MAX_QUESTIONS = 60;
const MAX_OPTIONS = 20;
const MAX_EXTRA_QUESTIONS = 2;

function sanitizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.slice(0, MAX_OPTIONS).map((o) => clampStr(o, 60)).filter(Boolean);
}

// نفس شكل السؤال يتكرر في القالب الافتراضي وفي الأسئلة الإضافية الخاصة
// بمتدرب معيّن، فمنطق التعقيم واحد للاتنين.
function sanitizeQuestion(q) {
  const type = QUESTION_TYPES.includes(q?.type) ? q.type : null;
  if (!type) return null;
  const label = clampStr(q?.label, 200).trim();
  if (!label) return null;
  const section = SECTIONS.includes(q?.section) ? q.section : 'notes';
  const options = ['single_choice', 'multiple_choice'].includes(type) ? sanitizeOptions(q?.options) : [];
  return { section, type, label, options, required: !!q?.required };
}

function sanitizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.slice(0, MAX_QUESTIONS).map(sanitizeQuestion).filter(Boolean);
}

// بيتأكد إن قيمة كل إجابة متوافقة مع نوع سؤالها المحدد في القالب/الأسئلة
// الإضافية - زي sanitizeDays/sanitizeFoods في routes/plans.js بالظبط، بس
// هنا محتاجين نعرف تعريف السؤال الأول عشان نعرف نوعه.
function sanitizeAnswerValue(question, value) {
  switch (question.type) {
    case 'single_choice':
      return typeof value === 'string' && question.options.includes(value) ? value : null;
    case 'multiple_choice':
      if (!Array.isArray(value)) return [];
      return value.filter((v) => typeof v === 'string' && question.options.includes(v)).slice(0, MAX_OPTIONS);
    case 'yes_no':
      return value === true || value === false ? value : null;
    case 'number':
    case 'measurement':
      return toNullableNumber(value);
    case 'short_text':
      return clampStr(value, 200);
    case 'long_text':
      return clampStr(value, 1000);
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    case 'image_upload':
      return value ? clampStr(value, 120) : null;
    default:
      return null;
  }
}

function questionsById(questions) {
  const map = new Map();
  questions.forEach((q) => map.set(q.id, q));
  return map;
}

function parseQuestionRow(row) {
  return { ...row, options: JSON.parse(row.options_json), required: !!row.required };
}

// -------------------- قالب الكوتش الافتراضي --------------------

router.get('/template', requireAuth, requireRole('coach'), (req, res) => {
  const template = db.prepare('SELECT * FROM assessment_templates WHERE coach_id = ? AND is_current = 1').get(req.user.id);
  if (!template) return res.json({ template: null });
  const questions = db.prepare('SELECT * FROM assessment_questions WHERE template_id = ? ORDER BY sort_order').all(template.id).map(parseQuestionRow);
  res.json({ template: { id: template.id, version: template.version, questions } });
});

router.put('/template', requireAuth, requireRole('coach'), (req, res) => {
  const questions = sanitizeQuestions(req.body.questions);
  if (!questions.length) return res.status(400).json({ error: 'ضيف سؤال واحد على الأقل' });

  const lastVersion = db.prepare('SELECT MAX(version) v FROM assessment_templates WHERE coach_id = ?').get(req.user.id).v || 0;
  const run = db.transaction(() => {
    db.prepare('UPDATE assessment_templates SET is_current = 0 WHERE coach_id = ? AND is_current = 1').run(req.user.id);
    const info = db.prepare('INSERT INTO assessment_templates (coach_id, version, is_current) VALUES (?, ?, 1)').run(req.user.id, lastVersion + 1);
    const insertQ = db.prepare(
      'INSERT INTO assessment_questions (template_id, section, type, label, options_json, required, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    questions.forEach((q, i) => insertQ.run(info.lastInsertRowid, q.section, q.type, q.label, JSON.stringify(q.options), q.required ? 1 : 0, i));
    return info.lastInsertRowid;
  });
  const templateId = run();
  res.json({ ok: true, templateId });
});

// -------------------- تقييم متدرب معيّن --------------------

router.get('/:subscriptionId', requireAuth, requireSubscriptionParty, (req, res) => {
  let row = db.prepare('SELECT * FROM client_assessments WHERE subscription_id = ?').get(req.sub.id);

  if (!row) {
    const coachTemplate = db.prepare('SELECT * FROM assessment_templates WHERE coach_id = ? AND is_current = 1').get(req.sub.coach_id);
    if (!coachTemplate) return res.json({ assessment: null, needsTemplate: true });
    db.prepare('INSERT INTO client_assessments (subscription_id, template_id) VALUES (?, ?)').run(req.sub.id, coachTemplate.id);
    row = db.prepare('SELECT * FROM client_assessments WHERE subscription_id = ?').get(req.sub.id);
  }

  const template = db.prepare('SELECT * FROM assessment_templates WHERE id = ?').get(row.template_id);
  const questions = db.prepare('SELECT * FROM assessment_questions WHERE template_id = ? ORDER BY sort_order').all(template.id).map(parseQuestionRow);
  res.json({
    assessment: {
      templateVersion: template.version,
      questions,
      extraQuestions: JSON.parse(row.extra_questions_json),
      answers: JSON.parse(row.answers_json),
      extraAnswers: JSON.parse(row.extra_answers_json),
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
    },
  });
});

router.put('/:subscriptionId/answers', requireAuth, requireSubscriptionParty, (req, res) => {
  if (req.isCoach) return res.status(403).json({ error: 'المتدرب بس اللي يقدر يعبّي التقييم بتاعه' });
  const row = db.prepare('SELECT * FROM client_assessments WHERE subscription_id = ?').get(req.sub.id);
  if (!row) return res.status(404).json({ error: 'مفيش تقييم لسه اتعمل - افتح شاشة التقييم الأول' });

  const template = db.prepare('SELECT id FROM assessment_templates WHERE id = ?').get(row.template_id);
  const questions = db.prepare('SELECT * FROM assessment_questions WHERE template_id = ?').all(template.id).map(parseQuestionRow);
  const extraQuestions = JSON.parse(row.extra_questions_json);

  const qMap = questionsById(questions);
  const rawAnswers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
  const answers = {};
  for (const [qId, value] of Object.entries(rawAnswers)) {
    const q = qMap.get(Number(qId));
    if (q) answers[qId] = sanitizeAnswerValue(q, value);
  }

  const rawExtraAnswers = req.body.extraAnswers && typeof req.body.extraAnswers === 'object' ? req.body.extraAnswers : {};
  const extraAnswers = {};
  extraQuestions.forEach((q, i) => {
    if (Object.prototype.hasOwnProperty.call(rawExtraAnswers, i)) {
      extraAnswers[i] = sanitizeAnswerValue(q, rawExtraAnswers[i]);
    }
  });

  db.prepare(
    `UPDATE client_assessments SET answers_json = ?, extra_answers_json = ?, updated_at = datetime('now'), submitted_at = COALESCE(submitted_at, datetime('now')) WHERE subscription_id = ?`
  ).run(JSON.stringify(answers), JSON.stringify(extraAnswers), req.sub.id);
  res.json({ ok: true });
});

// أسئلة إضافية خاصة بمتدرب معيّن بس - بتتخزن جوه صف client_assessments
// نفسه، ومش بتلمس assessment_questions/assessment_templates خالص، فمفيش
// أي احتمال إنها تأثر على القالب الافتراضي أو متدربين تانيين.
router.post('/:subscriptionId/extra-questions', requireAuth, requireSubscriptionParty, (req, res) => {
  if (!req.isCoach) return res.status(403).json({ error: 'الكوتش بس اللي يقدر يضيف أسئلة إضافية' });
  const row = db.prepare('SELECT * FROM client_assessments WHERE subscription_id = ?').get(req.sub.id);
  if (!row) return res.status(404).json({ error: 'مفيش تقييم لسه اتعمل لهذا المتدرب' });

  const existing = JSON.parse(row.extra_questions_json);
  const incoming = sanitizeQuestions(req.body.questions).slice(0, MAX_EXTRA_QUESTIONS - existing.length);
  if (!incoming.length) return res.status(400).json({ error: existing.length >= MAX_EXTRA_QUESTIONS ? 'وصلت للحد الأقصى (سؤالين) من الأسئلة الإضافية' : 'ضيف سؤال صحيح' });

  const updated = [...existing, ...incoming];
  db.prepare(`UPDATE client_assessments SET extra_questions_json = ?, updated_at = datetime('now') WHERE subscription_id = ?`).run(JSON.stringify(updated), req.sub.id);
  res.json({ ok: true, extraQuestions: updated });
});

function runUpload(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'حجم الصورة أكبر من 8 ميجا' });
    }
    if (err) return res.status(400).json({ error: 'حصل خطأ في رفع الصورة' });
    next();
  });
}

// نفس مسار الحماية الحقيقي المستخدم في كل رفع صور في التطبيق
// (magic bytes + إعادة ضغط عبر sharp) - مفيش مسار رفع أضعف لأسئلة الصور.
router.post('/:subscriptionId/upload-answer', requireAuth, requireSubscriptionParty, runUpload, async (req, res) => {
  if (req.isCoach) return res.status(403).json({ error: 'المتدرب بس اللي يقدر يرفع صور إجاباته' });
  if (!req.file) return res.status(400).json({ error: 'اختار صورة' });
  try {
    const filename = await saveGalleryPhoto(req.file.buffer);
    res.json({ ok: true, filename });
  } catch (e) {
    res.status(400).json({ error: e.message || 'حصل خطأ في رفع الصورة' });
  }
});

module.exports = router;
