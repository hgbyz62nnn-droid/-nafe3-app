import type { SportId } from '../sports/sports';

/**
 * TRAINO Deterministic Coaching Engine — shared types.
 *
 * Everything under domain/engine and domain/sports is a pure, static
 * rule/data system: level, plan, and coaching-response computation is
 * table lookups and arithmetic over pre-authored data, not a call to a
 * live LLM/AI API. This file has no side effects and no I/O.
 */

export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';

export type Goal = 'performance' | 'fat_loss' | 'muscle_gain' | 'general_fitness' | 'recovery';

export type Sex = 'male' | 'female';

export type DietaryPreference = 'no_restriction' | 'vegetarian' | 'vegan' | 'high_protein' | 'low_carb';

export type BudgetTier = 'low' | 'medium' | 'high';

export interface AssessmentAnswers {
  firstName: string;
  sport: SportId;
  goal: Goal;
  /** Years of consistent training/playing experience in this sport. */
  experienceYears: number;
  /** Sessions per week the athlete currently trains. */
  currentTrainingFrequency: number;
  /** Sessions per week the athlete wants/can commit to going forward. */
  daysAvailablePerWeek: number;
  trainingLocationIds: string[];
  equipmentIds: string[];
  /** Injury/limitation tag ids, e.g. 'knee', 'shoulder'; ['none'] = no limitations. */
  injuryIds: string[];
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  dietaryPreference: DietaryPreference;
  allergyIds: string[];
  budgetTier: BudgetTier;
}

export interface UserProfile {
  answers: AssessmentAnswers;
  level: FitnessLevel;
  nutrition: NutritionTargets;
}

export interface NutritionTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export type ExerciseCategory = 'warmup' | 'strength' | 'power' | 'conditioning' | 'cooldown';

export interface ExerciseSlot {
  name: string;
  sets: number;
  /** e.g. "6", "8-10", "20 sec", "6 / leg" */
  reps: string;
  restSec?: number;
  /** Equipment ids that satisfy this slot; empty array = bodyweight/no equipment needed. */
  equipment: string[];
  /** Training-location ids (see domain/assessment/trainingLocations.ts) where this slot is
   * feasible, e.g. a full-field simulation tagged ['sports_field', 'sports_club', 'multiple'].
   * Omitted/empty = feasible anywhere the athlete trains. */
  locations?: string[];
  /** Substitute exercise used when none of `equipment` is available, none of `locations` matches,
   * an injury contraindicates this slot, or the AI Coach applies a bodyweight-only/pain-safe
   * adjustment. Always low-load and bodyweight-only, and always location-unconstrained. */
  bodyweightAlternative?: { name: string; reps: string };
  category: ExerciseCategory;
  /** Health-limitation tag ids (see domain/assessment/health.ts) this movement should be avoided
   * for, e.g. a loaded knee-flexion exercise tagged 'knee'. */
  contraindications?: string[];
  /** Jumping/sprinting/direction-change movements — dropped or swapped when the athlete reports pain. */
  highImpact?: boolean;
}

/** The 3 buckets the Progress screen reports on. A required field on every
 * day template (not guessed from the workout's name) so that a new sport
 * module is correctly bucketed without touching progressEngine.ts. */
export type PerformanceCategory = 'speed' | 'strength' | 'stamina';

export interface WorkoutDayTemplate {
  id: string;
  name: string;
  focus: string;
  intensity: 'Low' | 'Medium' | 'High';
  durationMin: number;
  statCategory: PerformanceCategory;
  exercises: ExerciseSlot[];
}

/** One ordered weekly cycle of day templates per fitness level. */
export type SportTrainingProgram = Record<FitnessLevel, WorkoutDayTemplate[]>;

export interface SportModuleData {
  id: SportId;
  program: SportTrainingProgram;
  /** Nutrition macro emphasis multiplier applied on top of the generic calculator. */
  nutritionProfile: {
    proteinGPerKg: number;
    carbBias: 'low' | 'moderate' | 'high';
  };
}

/** The fixed set of quick-reply intents the AI Coach screen offers — a closed, enumerable list. */
export type AiCoachIntent =
  | 'feeling_tired'
  | 'adjust_todays_workout'
  | 'have_pain'
  | 'traveling'
  | 'replace_exercise'
  | 'missed_workout'
  | 'ask_about_nutrition';

export interface AiCoachAdjustment {
  /** Applied to today's remaining sets/volume, e.g. 0.7 = cut 30%. */
  volumeMultiplier?: number;
  swapToBodyweight?: boolean;
  skipHighImpact?: boolean;
  note: string;
}

export interface AiCoachReply {
  message: string;
  adjustment?: AiCoachAdjustment;
  adjustmentSummary?: string[];
  ctaLabel?: string;
}


export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface MealTemplate {
  id: string;
  name: string;
  description: string;
  slot: MealSlot;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Preferences this meal satisfies; 'no_restriction' meals are always eligible. */
  dietaryTags: DietaryPreference[];
  /** Allergy ids this meal contains; excluded for any athlete who reported that allergy. */
  allergens: string[];
  budgetTier: BudgetTier;
}

export interface MealPlanEntry {
  slot: MealSlot;
  /** Null only if no meal in the library is safe against the athlete's allergies for this slot. */
  meal: MealTemplate | null;
}

export interface WeeklyReportData {
  headline: string;
  subtext: string;
  workoutsCompleted: number;
  workoutsPlanned: number;
  nutritionAdherencePct: number;
  recoveryLabel: string;
  recoveryAveragePct: number;
  weightDeltaKg: number;
  coachFeedback: string;
}
