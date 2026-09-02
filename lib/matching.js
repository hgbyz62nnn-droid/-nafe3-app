// مطابقة حتمية (deterministic) بناءً على خصائص حقيقية مسجلة عند المدرب -
// مفيش أي "ذكاء اصطناعي" هنا ولازم مايتقالش كده في أي واجهة، الحساب كله
// تراكب أوزان ثابتة بين إجابات المتدرب وبين الوسوم اللي المدرب اختارها
// بنفسه (لو مفيش وسوم عند المدرب، البعد ده مبيدخلش في الحساب أصلًا بدل
// ما نختلق تطابق وهمي).

const GOALS = ['lose_fat', 'build_muscle', 'get_stronger', 'improve_fitness', 'calisthenics', 'athletic_performance'];
const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];
const TRAINING_TYPES = ['gym', 'home', 'online', 'in_person'];

const WEIGHTS = { goal: 35, trainingType: 25, experience: 15, budget: 15, location: 10 };

function safeParseArray(json) {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function computeCompatibility(coach, answers) {
  const goals = safeParseArray(coach.goals_json);
  const trainingTypes = safeParseArray(coach.training_types_json);
  const experienceLevels = safeParseArray(coach.experience_levels_json);

  let score = 0;
  let maxScore = 0;

  if (answers.goal) {
    maxScore += WEIGHTS.goal;
    if (goals.includes(answers.goal)) score += WEIGHTS.goal;
  }
  if (answers.trainingType) {
    maxScore += WEIGHTS.trainingType;
    if (trainingTypes.includes(answers.trainingType)) score += WEIGHTS.trainingType;
  }
  if (answers.experience) {
    maxScore += WEIGHTS.experience;
    if (experienceLevels.includes(answers.experience)) score += WEIGHTS.experience;
  }
  if (answers.budget) {
    maxScore += WEIGHTS.budget;
    const prices = [coach.price_1m, coach.price_3m, coach.price_6m].filter((p) => p > 0);
    const cheapest = prices.length ? Math.min(...prices) : null;
    if (cheapest != null && cheapest <= answers.budget) score += WEIGHTS.budget;
  }
  if (answers.location) {
    maxScore += WEIGHTS.location;
    const loc = String(coach.location || '').trim().toLowerCase();
    const wantLoc = answers.location.trim().toLowerCase();
    if (trainingTypes.includes('online') || (loc && wantLoc && (loc.includes(wantLoc) || wantLoc.includes(loc)))) {
      score += WEIGHTS.location;
    }
  }

  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
}

module.exports = { GOALS, EXPERIENCE_LEVELS, TRAINING_TYPES, computeCompatibility };
