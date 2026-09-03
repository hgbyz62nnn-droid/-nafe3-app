import type { BudgetTier, DietaryPreference, Goal, Sex } from '../engine/types';

/**
 * Nutrition Engine — shared types (Food Library, Meal Builder, Daily Plan).
 *
 * Mirrors the Exercise Intelligence architecture on purpose: a controlled,
 * generic `FoodDefinition` data model + a validated read-only registry + a
 * deterministic matching/ranking engine, all reading the SAME controlled
 * vocabularies the rest of the app already uses (`DietaryPreference`,
 * `BudgetTier` from engine/types.ts, allergen ids from
 * domain/assessment/nutritionPreferences.ts) rather than inventing parallel
 * ones. Nothing here calls an external AI/LLM — every plan is table
 * lookups and arithmetic over pre-authored, sourced food data.
 */

/** The functional role a food plays when composing a meal — the axis the
 * Meal Builder uses to combine 2-3 foods into a balanced meal, and the axis
 * food substitution preserves (a carb source replaces a carb source). */
export type MealRole = 'protein' | 'carb' | 'fat' | 'vegetable' | 'fruit' | 'dairy' | 'legume' | 'mixed';

export type FoodCategory =
  | 'grain'
  | 'protein'
  | 'dairy'
  | 'vegetable'
  | 'fruit'
  | 'legume'
  | 'fat_oil'
  | 'nut_seed'
  | 'beverage'
  | 'mixed_dish';

export type ServingUnit = 'g' | 'ml' | 'piece' | 'cup' | 'slice' | 'tbsp';

/** A coarse "where this is a practical, commonly-available staple" tag —
 * ranking-only, never a hard filter (a general-tagged food is still fully
 * usable for an Egyptian/MENA athlete, it's just not a regional specialty). */
export type FoodRegion = 'egyptian_mena' | 'general';

export interface FoodDefinition {
  id: string;
  /** Matches the name this food is authored under below. */
  canonicalName: string;
  displayName: string;
  aliases: string[];
  category: FoodCategory;
  mealRoles: MealRole[];
  servingUnit: ServingUnit;
  /** The reference amount the macros below describe, e.g. 100 (grams) or 1 (piece). */
  servingSize: number;
  /** Per-serving values (at `servingSize` `servingUnit`) — never per-100g unless
   * servingUnit is 'g' and servingSize is 100. Real, sourced figures only (see
   * `source`/`sourceVersion`) — never fabricated precision. */
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Undefined means "not reliably known" — never defaulted to 0 and presented as fact. */
  fiberG?: number;
  /** Every DietaryPreference this food is compatible with, e.g. lentils ->
   * ['no_restriction', 'vegetarian', 'vegan']; chicken -> ['no_restriction']. A hard
   * compatibility filter — 'high_protein'/'low_carb' are athlete ranking preferences,
   * not food properties, and are never used to hard-filter here (see matchingEngine.ts). */
  dietaryTags: DietaryPreference[];
  /** Allergen ids (domain/assessment/nutritionPreferences.ts ALLERGY_OPTIONS) this food
   * contains — the SAME vocabulary AssessmentAnswers.allergyIds already uses. */
  allergens: string[];
  region: FoodRegion;
  budgetTier: BudgetTier;
  /** Non-diagnostic prep note ("soak overnight", "grill, no added oil") — optional. */
  preparationNotes?: string;
  /** Documented provenance — never omitted, never claims lab-exact precision. */
  source: string;
  sourceVersion: string;
}

export type FoodMatchReasonCode =
  | 'same_meal_role'
  | 'macro_compatible'
  | 'calorie_compatible'
  | 'budget_fit'
  | 'dietary_compatible'
  | 'previously_preferred'
  | 'variety'
  | 'region_relevant';

export interface FoodMatchCandidate {
  food: FoodDefinition;
  score: number;
  reasons: FoodMatchReasonCode[];
}

export type FoodPreferenceSignal = 'liked' | 'disliked' | 'frequently_replaced' | 'frequently_logged';

/** Structured input to the food matching engine — every field here is
 * already-known athlete/session data; nothing is inferred at match time. */
export interface FoodMatchQuery {
  sourceFoodId: string;
  role: MealRole;
  /** Calorie/macro budget the replacement should reasonably fit within. */
  targetCalories: number;
  dietaryPreference: DietaryPreference;
  allergyIds: string[];
  budgetTier: BudgetTier;
  preferenceByFoodId?: Record<string, FoodPreferenceSignal>;
  recentlyUsedFoodIds?: string[];
}

/** Athlete-facing nutrition profile, derived (never duplicated) from the existing
 * sanitized AssessmentAnswers + the athlete's sport module — the single input the
 * Energy/Macro/Meal-Builder engines read from. */
export interface NutritionProfile {
  goal: Goal;
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  daysAvailablePerWeek: number;
  sport: string;
  dietaryPreference: DietaryPreference;
  allergyIds: string[];
  budgetTier: BudgetTier;
  /** Athlete's configured meal count — one of the supported MEAL_DISTRIBUTIONS keys. */
  mealsPerDay: 3 | 4 | 5;
  /** Deterministic ranking-only signals, never hard exclusions (see preferences.ts). */
  dislikedFoodIds: string[];
  likedFoodIds: string[];
  /** Whether today is a training day for this athlete — drives carbohydrate
   * distribution, never total daily calories (spec: never randomly changes total). */
  isTrainingDay: boolean;
}

export interface PlannedFoodItem {
  foodId: string;
  role: MealRole;
  /** Multiple of the food's own servingSize/servingUnit, e.g. 1.5 servings. */
  quantity: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PlannedMeal {
  /** Stable slot identifier for this meal within the day (e.g. 'breakfast', 'snack_1'). */
  slotId: string;
  slotLabel: string;
  items: PlannedFoodItem[];
  totals: MealTotals;
}

export interface DailyNutritionPlan {
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  meals: PlannedMeal[];
  totals: MealTotals;
  /** How far the actual composed totals landed from the target — never hidden. */
  reconciliation: {
    caloriesDiff: number;
    withinTolerance: boolean;
  };
}

/** One real, logged exposure to one food on one date — mirrors
 * ExercisePerformanceLog's "snapshot nutrition at logging time" contract exactly, so a
 * later edit to a FoodDefinition's macros never silently rewrites historical logs. */
export interface NutritionLogEntry {
  date: string; // YYYY-MM-DD, local calendar date
  slotId: string;
  foodId: string;
  quantity: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** True when this food was swapped from the plan's originally suggested food this
   * session — evidence/audit only, never affects the snapshotted macros above. */
  wasModified: boolean;
  submittedAt: string; // ISO timestamp
}
