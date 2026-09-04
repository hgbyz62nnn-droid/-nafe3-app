import type { AssessmentAnswers, BudgetTier, DietaryPreference, Goal, Sex } from './types';
import { SPORTS, type SportId } from '../sports/sports';
import type { DailyReadinessInputs, ReadinessScale } from '../readiness/types';
import type { ExercisePerformanceLog } from '../progression/types';
import type { NutritionLogEntry } from '../nutrition/types';

/**
 * Boundary validation/sanitization for the deterministic engine. Persisted
 * state already passes a structural type-guard on load (see
 * `state/persistence.ts`), but "the right shape" is not "safe values" — a
 * corrupted or hand-edited localStorage entry can still carry an `age` of
 * -40 or a `sport` string that was never a real sport id. Every value the
 * Training/Nutrition/Coaching engines read ultimately comes from
 * `UserProfile.answers`, so sanitizing it once here, at the one place it's
 * derived (`ProfileContext`'s `profile` memo), is enough to guarantee none
 * of the three engines ever sees NaN, an impossible range, or a
 * made-up enum value — clamped/defaulted instead of ever thrown or
 * silently propagated as `NaN`/`undefined`.
 */

export interface SanitizeResult<T> {
  value: T;
  /** Human-readable description of each field that had to be corrected. Empty = input was clean. */
  violations: string[];
}

const GOALS: Goal[] = ['performance', 'fat_loss', 'muscle_gain', 'general_fitness', 'recovery'];
const SEXES: Sex[] = ['male', 'female'];
const DIETARY_PREFERENCES: DietaryPreference[] = ['no_restriction', 'vegetarian', 'vegan', 'high_protein', 'low_carb'];
const BUDGET_TIERS: BudgetTier[] = ['low', 'medium', 'high'];
const VALID_SPORT_IDS: SportId[] = SPORTS.map((s) => s.id);

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  label: string,
  violations: string[]
): number {
  const n = typeof value === 'number' ? value : NaN;
  if (Number.isNaN(n)) {
    violations.push(`${label}: not a finite number (${JSON.stringify(value)}), defaulted to ${fallback}`);
    return fallback;
  }
  if (n < min) {
    violations.push(`${label}: ${n} is below minimum ${min}, clamped`);
    return min;
  }
  if (n > max) {
    violations.push(`${label}: ${n} is above maximum ${max}, clamped`);
    return max;
  }
  return n;
}

/** `mealsPerDay` is a numeric enum (3/4/5), not a string one — omitted entirely for
 * every profile persisted before the Nutrition Engine Expansion, so `undefined` is
 * the expected common case and is defaulted silently, without recording a violation
 * (violations are for genuinely corrupt/unexpected values, not "field didn't exist
 * yet" backward compatibility). */
function sanitizeMealsPerDay(value: unknown, violations: string[]): 3 | 4 | 5 {
  if (value === 3 || value === 4 || value === 5) return value;
  if (value !== undefined) {
    violations.push(`mealsPerDay: invalid value ${JSON.stringify(value)}, defaulted to 4`);
  }
  return 4;
}

const PERFORMANCE_PRIORITIES = ['speed', 'strength', 'conditioning'] as const;

/** Optional, additive fields (spec: Deep Adaptive Assessment) — absent on every profile
 * persisted before this change, so `undefined` is the expected common case and is
 * defaulted silently, following the exact `mealsPerDay` precedent above. */
function sanitizeSessionDurationMin(value: unknown, violations: string[]): number {
  if (value === undefined) return 45;
  const n = typeof value === 'number' ? value : NaN;
  if (Number.isNaN(n)) {
    violations.push(`sessionDurationMin: not a finite number (${JSON.stringify(value)}), defaulted to 45`);
    return 45;
  }
  return Math.min(180, Math.max(10, Math.round(n)));
}

function sanitizePerformancePriority(value: unknown, violations: string[]): 'speed' | 'strength' | 'conditioning' {
  if (value === undefined) return 'strength';
  if (typeof value === 'string' && (PERFORMANCE_PRIORITIES as readonly string[]).includes(value)) {
    return value as 'speed' | 'strength' | 'conditioning';
  }
  violations.push(`performancePriority: invalid value ${JSON.stringify(value)}, defaulted to 'strength'`);
  return 'strength';
}

function sanitizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  label: string,
  violations: string[]
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  violations.push(`${label}: invalid value ${JSON.stringify(value)}, defaulted to ${fallback}`);
  return fallback;
}

function sanitizeStringArray(value: unknown, label: string, violations: string[]): string[] {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value;
  violations.push(`${label}: not a string array (${JSON.stringify(value)}), reset to []`);
  return [];
}

/**
 * Sanitizes a full set of assessment answers to values every engine can
 * safely consume. Never throws; always returns a usable `AssessmentAnswers`,
 * with every correction it made listed in `violations` for the caller to
 * log (never silently swallowed, never surfaced to the athlete as an error).
 */
export function sanitizeAssessmentAnswers(answers: AssessmentAnswers): SanitizeResult<AssessmentAnswers> {
  const violations: string[] = [];

  const sport = sanitizeEnum(answers.sport, VALID_SPORT_IDS, 'football', 'sport', violations);
  const injuryIdsRaw = sanitizeStringArray(answers.injuryIds, 'injuryIds', violations);
  const injuryIds = injuryIdsRaw.length > 0 ? injuryIdsRaw : ['none'];

  const value: AssessmentAnswers = {
    firstName: typeof answers.firstName === 'string' ? answers.firstName : '',
    sport,
    goal: sanitizeEnum(answers.goal, GOALS, 'general_fitness', 'goal', violations),
    experienceYears: clampNumber(answers.experienceYears, 0, 80, 0, 'experienceYears', violations),
    currentTrainingFrequency: clampNumber(answers.currentTrainingFrequency, 0, 14, 0, 'currentTrainingFrequency', violations),
    daysAvailablePerWeek: clampNumber(answers.daysAvailablePerWeek, 0, 14, 0, 'daysAvailablePerWeek', violations),
    trainingLocationIds: sanitizeStringArray(answers.trainingLocationIds, 'trainingLocationIds', violations),
    equipmentIds: sanitizeStringArray(answers.equipmentIds, 'equipmentIds', violations),
    injuryIds,
    sex: sanitizeEnum(answers.sex, SEXES, 'male', 'sex', violations),
    age: clampNumber(answers.age, 5, 100, 25, 'age', violations),
    heightCm: clampNumber(answers.heightCm, 50, 250, 170, 'heightCm', violations),
    weightKg: clampNumber(answers.weightKg, 20, 300, 70, 'weightKg', violations),
    dietaryPreference: sanitizeEnum(answers.dietaryPreference, DIETARY_PREFERENCES, 'no_restriction', 'dietaryPreference', violations),
    allergyIds: sanitizeStringArray(answers.allergyIds, 'allergyIds', violations),
    budgetTier: sanitizeEnum(answers.budgetTier, BUDGET_TIERS, 'medium', 'budgetTier', violations),
    mealsPerDay: sanitizeMealsPerDay(answers.mealsPerDay, violations),
    sessionDurationMin: sanitizeSessionDurationMin(answers.sessionDurationMin, violations),
    performancePriority: sanitizePerformancePriority(answers.performancePriority, violations),
    sportPositionId: typeof answers.sportPositionId === 'string' ? answers.sportPositionId : undefined,
  };

  return { value, violations };
}

/** A logged bodyweight is safe to store only if it's a finite, physically-plausible value —
 * NaN/zero/negative/absurd input (a bad form parse, a stray keystroke) is rejected outright
 * rather than corrupting the weight-trend history Progress/WeeklyReport read from. */
export function isValidWeightKg(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= 300;
}

const READINESS_SCALES: ReadinessScale[] = [1, 2, 3, 4, 5];

function sanitizeReadinessScale(value: unknown, label: string, violations: string[]): ReadinessScale {
  const n = typeof value === 'number' ? Math.round(value) : NaN;
  if (Number.isNaN(n) || !READINESS_SCALES.includes(n as ReadinessScale)) {
    violations.push(`${label}: invalid value (${JSON.stringify(value)}), defaulted to 3`);
    return 3;
  }
  return n as ReadinessScale;
}

/**
 * Sanitizes one day's readiness check-in inputs before they ever reach
 * `computeReadiness` — a corrupted/hand-edited localStorage entry or a bad
 * form parse must never produce NaN, an out-of-range scale value, or an
 * invalid enum, per the same "sanitize once at the boundary" architecture
 * `sanitizeAssessmentAnswers` already uses above.
 */
export function sanitizeReadinessInputs(inputs: DailyReadinessInputs): SanitizeResult<DailyReadinessInputs> {
  const violations: string[] = [];

  const value: DailyReadinessInputs = {
    sleepQuality: sanitizeReadinessScale(inputs.sleepQuality, 'sleepQuality', violations),
    sleepDurationBucket: sanitizeReadinessScale(inputs.sleepDurationBucket, 'sleepDurationBucket', violations),
    energy: sanitizeReadinessScale(inputs.energy, 'energy', violations),
    stress: sanitizeReadinessScale(inputs.stress, 'stress', violations),
    soreness: sanitizeReadinessScale(inputs.soreness, 'soreness', violations),
    motivation: sanitizeReadinessScale(inputs.motivation, 'motivation', violations),
    painFlag: typeof inputs.painFlag === 'boolean' ? inputs.painFlag : false,
    painNote: typeof inputs.painNote === 'string' ? inputs.painNote : undefined,
  };

  if (typeof inputs.painFlag !== 'boolean') {
    violations.push(`painFlag: not a boolean (${JSON.stringify(inputs.painFlag)}), defaulted to false`);
  }

  return { value, violations };
}

/** A plan-week/progression-week number the engine will index/multiply against — reject
 * anything that isn't a finite, non-negative integer rather than let a NaN or negative
 * value corrupt `applyProgression`'s arithmetic or an array index derived from it. */
export function isValidWeekNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

/** Reps-in-reserve realistically ranges 0 (failure) to about 10 (very easy) — anything
 * outside that is almost certainly a bad input, not a real report. */
const RIR_MIN = 0;
const RIR_MAX = 10;

function sanitizePositiveInt(value: unknown, label: string, violations: string[]): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === 'number' ? Math.round(value) : NaN;
  if (!Number.isFinite(n) || n < 0) {
    violations.push(`${label}: invalid (${JSON.stringify(value)}), dropped`);
    return undefined;
  }
  return n;
}

function sanitizePositiveFinite(value: unknown, label: string, violations: string[]): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n < 0) {
    violations.push(`${label}: invalid (${JSON.stringify(value)}), dropped`);
    return undefined;
  }
  return Math.round(n * 10) / 10;
}

/**
 * Sanitizes one exercise's logged performance before it ever reaches the Progression
 * Engine — a bad form parse or corrupted localStorage entry must never hand the engine
 * NaN/Infinity/negative sets, reps, load, duration, or distance, and RIR must never
 * silently smuggle in an out-of-range value. Missing optional fields (load/reps/
 * duration/distance/RIR not applicable to this exercise's model, or just not logged)
 * are left `undefined` — "unknown", never coerced into a value that reads as good or bad.
 */
export function sanitizeExercisePerformanceLog(
  log: ExercisePerformanceLog
): SanitizeResult<ExercisePerformanceLog> {
  const violations: string[] = [];

  const prescribedSetsRaw = typeof log.prescribedSets === 'number' ? Math.round(log.prescribedSets) : NaN;
  const prescribedSets = Number.isFinite(prescribedSetsRaw) && prescribedSetsRaw >= 0 ? prescribedSetsRaw : 0;
  if (prescribedSets !== log.prescribedSets) {
    violations.push(`prescribedSets: invalid (${JSON.stringify(log.prescribedSets)}), defaulted to ${prescribedSets}`);
  }

  const completedSetsRaw = typeof log.completedSets === 'number' ? Math.round(log.completedSets) : NaN;
  const completedSets = Number.isFinite(completedSetsRaw) && completedSetsRaw >= 0 ? completedSetsRaw : 0;
  if (completedSets !== log.completedSets) {
    violations.push(`completedSets: invalid (${JSON.stringify(log.completedSets)}), defaulted to ${completedSets}`);
  }

  let rir: number | undefined;
  if (log.rir !== undefined) {
    const n = typeof log.rir === 'number' ? Math.round(log.rir) : NaN;
    if (Number.isFinite(n) && n >= RIR_MIN && n <= RIR_MAX) {
      rir = n;
    } else {
      violations.push(`rir: out of range (${JSON.stringify(log.rir)}), dropped`);
    }
  }

  const value: ExercisePerformanceLog = {
    date: typeof log.date === 'string' ? log.date : '',
    exerciseName: typeof log.exerciseName === 'string' && log.exerciseName.length > 0 ? log.exerciseName : 'Unknown exercise',
    prescribedSets,
    completedSets,
    repsAchieved: sanitizePositiveInt(log.repsAchieved, 'repsAchieved', violations),
    loadKg: sanitizePositiveFinite(log.loadKg, 'loadKg', violations),
    durationSec: sanitizePositiveFinite(log.durationSec, 'durationSec', violations),
    distanceM: sanitizePositiveFinite(log.distanceM, 'distanceM', violations),
    rir,
    wasModified: typeof log.wasModified === 'boolean' ? log.wasModified : false,
    contextMode: log.contextMode === 'travel' || log.contextMode === 'competition' ? log.contextMode : undefined,
    originalExerciseName: typeof log.originalExerciseName === 'string' && log.originalExerciseName.length > 0 ? log.originalExerciseName : undefined,
    submittedAt: typeof log.submittedAt === 'string' ? log.submittedAt : new Date().toISOString(),
  };

  return { value, violations };
}

/**
 * Sanitizes one logged food entry before it ever reaches nutrition adherence
 * calculations — quantity/calories/macros must never be NaN/Infinity/negative. The
 * calorie/macro fields are a SNAPSHOT of the FoodDefinition's values at logging time
 * (spec §21) — this function never re-derives them from the current Food Registry, so
 * a later edit to a food's macros can never silently rewrite historical logs.
 */
export function sanitizeNutritionLogEntry(entry: NutritionLogEntry): SanitizeResult<NutritionLogEntry> {
  const violations: string[] = [];

  function sanitizeNonNegative(value: unknown, label: string): number {
    const n = typeof value === 'number' ? value : NaN;
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 10) / 10;
    violations.push(`${label}: invalid (${JSON.stringify(value)}), defaulted to 0`);
    return 0;
  }

  const value: NutritionLogEntry = {
    date: typeof entry.date === 'string' ? entry.date : '',
    slotId: typeof entry.slotId === 'string' && entry.slotId.length > 0 ? entry.slotId : 'unknown',
    foodId: typeof entry.foodId === 'string' && entry.foodId.length > 0 ? entry.foodId : 'unknown',
    quantity: sanitizeNonNegative(entry.quantity, 'quantity'),
    calories: sanitizeNonNegative(entry.calories, 'calories'),
    proteinG: sanitizeNonNegative(entry.proteinG, 'proteinG'),
    carbsG: sanitizeNonNegative(entry.carbsG, 'carbsG'),
    fatG: sanitizeNonNegative(entry.fatG, 'fatG'),
    wasModified: typeof entry.wasModified === 'boolean' ? entry.wasModified : false,
    submittedAt: typeof entry.submittedAt === 'string' ? entry.submittedAt : new Date().toISOString(),
  };

  return { value, violations };
}
