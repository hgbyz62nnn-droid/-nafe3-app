import type { AssessmentAnswers, BudgetTier, DietaryPreference, Goal, Sex } from './types';
import { SPORTS, type SportId } from '../sports/sports';

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
  };

  return { value, violations };
}

/** A logged bodyweight is safe to store only if it's a finite, physically-plausible value —
 * NaN/zero/negative/absurd input (a bad form parse, a stray keystroke) is rejected outright
 * rather than corrupting the weight-trend history Progress/WeeklyReport read from. */
export function isValidWeightKg(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= 300;
}

/** A plan-week/progression-week number the engine will index/multiply against — reject
 * anything that isn't a finite, non-negative integer rather than let a NaN or negative
 * value corrupt `applyProgression`'s arithmetic or an array index derived from it. */
export function isValidWeekNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}
