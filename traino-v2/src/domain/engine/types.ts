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
  /** Athlete's preferred meal count (3/4/5) — optional so existing persisted
   * profiles (pre-Nutrition-Engine-Expansion) remain valid without a migration;
   * missing/invalid values fall back to 4 (see domain/nutrition — the
   * MEAL_DISTRIBUTIONS default the app already used). */
  mealsPerDay?: 3 | 4 | 5;
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

/** 'technique' is for skill/drill work that is neither loaded strength/power nor pure
 * conditioning volume (e.g. a swim stroke drill, a footwork drill) — introduced for the
 * Swimming module rather than overloading 'conditioning' for it, and available to any
 * future sport with the same kind of skill-focused work. */
export type ExerciseCategory = 'warmup' | 'strength' | 'power' | 'conditioning' | 'technique' | 'cooldown';

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
    /** Short, pre-authored nutrition notes for this sport (training-day fueling,
     * hydration awareness, recovery emphasis, etc.) — read generically by the
     * Nutrition Engine/AI Coach (e.g. surfaced verbatim as "why these foods"
     * context); never branched on by id. Optional — a sport with nothing
     * specific to say here just omits it, never a fabricated placeholder. */
    considerations?: string[];
  };
}

/** The fixed set of quick-reply intents the AI Coach screen offers — a closed, enumerable list.
 * 'why_consistency_dropped'/'whats_next_week_change'/'why_workout_reduced' surface Weekly
 * Coaching Loop context deterministically (see weeklyCoachingEngine.ts); 'how_ready_am_i'/
 * 'should_i_train_today' surface Daily Readiness System context deterministically (see
 * readinessEngine.ts); 'why_weight_increased'/'why_no_progression'/'whats_changed_from_last_week'/
 * 'what_should_i_aim_for' surface the Progression Engine's decisions deterministically (see
 * exerciseProgressionEngine.ts); 'why_this_exercise'/'what_muscles_does_this_train'/
 * 'easier_version'/'harder_version'/'why_limited_alternatives' surface Exercise Intelligence
 * data deterministically (see domain/exercise/registry.ts + matchingEngine.ts);
 * 'what_should_i_eat_today'/'what_are_my_calories'/'why_these_foods'/'replace_food'/
 * 'how_is_my_nutrition_this_week' surface the Nutrition Engine deterministically (see
 * domain/nutrition/registry.ts + matchingEngine.ts + adherence.ts) — every one of them still
 * resolves to pre-templated text over structured data, never a generated explanation. */
export type AiCoachIntent =
  | 'feeling_tired'
  | 'adjust_todays_workout'
  | 'have_pain'
  | 'traveling'
  | 'replace_exercise'
  | 'missed_workout'
  | 'ask_about_nutrition'
  | 'why_consistency_dropped'
  | 'whats_next_week_change'
  | 'why_workout_reduced'
  | 'how_ready_am_i'
  | 'should_i_train_today'
  | 'why_weight_increased'
  | 'why_no_progression'
  | 'whats_changed_from_last_week'
  | 'what_should_i_aim_for'
  | 'why_this_exercise'
  | 'what_muscles_does_this_train'
  | 'easier_version'
  | 'harder_version'
  | 'why_limited_alternatives'
  | 'what_should_i_eat_today'
  | 'what_are_my_calories'
  | 'why_these_foods'
  | 'replace_food'
  | 'how_is_my_nutrition_this_week'
  | 'im_traveling'
  | 'how_train_while_traveling'
  | 'whats_changed_traveling'
  | 'i_have_competition'
  | 'why_workout_adjusted_for_context'
  | 'after_competition'
  | 'when_normal_plan_returns';

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
