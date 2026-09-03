import type { DietaryPreference } from '../engine/types';
import type { FoodDefinition, FoodMatchCandidate, FoodMatchQuery, FoodMatchReasonCode, FoodPreferenceSignal, MealRole } from './types';
import { getAllFoods, getFood } from './registry';

/**
 * Deterministic food matching/ranking engine (spec §19). Pure function of
 * its inputs — same query always produces the same ranked list, no
 * randomness. Two HARD filters run before any scoring: allergen safety
 * (spec §16 — "must never appear... not a ranking preference") and dietary
 * compatibility (spec §15 — "hard compatibility requirement"). Meal role is
 * also required, not merely ranked: the entire meaning of "a carbohydrate
 * alternative" (spec §10) is that the candidate can fill the same role in
 * the meal — a protein source returned for a "carb alternative" query
 * wouldn't be an alternative at all. Everything else (macro/calorie
 * closeness, budget, preference, variety) is ranking-only.
 */

const WEIGHTS = {
  macroCompatibilityMax: 40,
  calorieCompatibilityMax: 30,
  budgetFit: 12,
  regionRelevant: 4,
  preferenceLiked: 15,
  preferenceFrequentlyLogged: 6,
  preferenceFrequentlyReplaced: -10,
  preferenceDisliked: -20,
  recentlyUsedPenalty: -5,
} as const;

const BUDGET_ORDER: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 1, high: 2 };

/** 'high_protein'/'low_carb' are athlete ranking preferences about macro emphasis, not
 * a food-safety dietary pattern — they never exclude a food the way vegetarian/vegan do. */
function dietHardFilterKey(pref: DietaryPreference): DietaryPreference {
  return pref === 'high_protein' || pref === 'low_carb' ? 'no_restriction' : pref;
}

function isAllergySafe(food: FoodDefinition, allergyIds: string[]): boolean {
  const activeAllergies = allergyIds.filter((id) => id !== 'none');
  return !food.allergens.some((a) => activeAllergies.includes(a));
}

function isDietCompatible(food: FoodDefinition, pref: DietaryPreference): boolean {
  return food.dietaryTags.includes(dietHardFilterKey(pref));
}

/** Per-serving macro profile (share of calories from each macro) — the axis used to
 * judge "comparable nutrition" between a source food and a candidate, independent of
 * absolute serving size. */
function macroProfile(food: FoodDefinition): { proteinShare: number; carbShare: number; fatShare: number } {
  const kcal = food.proteinG * 4 + food.carbsG * 4 + food.fatG * 9;
  if (kcal <= 0) return { proteinShare: 0, carbShare: 0, fatShare: 0 };
  return { proteinShare: (food.proteinG * 4) / kcal, carbShare: (food.carbsG * 4) / kcal, fatShare: (food.fatG * 9) / kcal };
}

function macroDistance(a: FoodDefinition, b: FoodDefinition): number {
  const pa = macroProfile(a);
  const pb = macroProfile(b);
  return Math.abs(pa.proteinShare - pb.proteinShare) + Math.abs(pa.carbShare - pb.carbShare) + Math.abs(pa.fatShare - pb.fatShare);
}

/**
 * Ranked, allergy/diet/role-filtered candidates for replacing `query.sourceFoodId`.
 * Never includes the source food itself, never includes an unsafe or
 * dietary-incompatible food, never includes a food that can't fill the same meal role.
 */
export function findFoodAlternatives(query: FoodMatchQuery): FoodMatchCandidate[] {
  const source = getFood(query.sourceFoodId);

  const candidates: FoodMatchCandidate[] = [];
  for (const food of getAllFoods()) {
    if (food.id === query.sourceFoodId) continue;
    if (!food.mealRoles.includes(query.role)) continue;
    if (!isAllergySafe(food, query.allergyIds)) continue;
    if (!isDietCompatible(food, query.dietaryPreference)) continue;

    const reasons: FoodMatchReasonCode[] = ['same_meal_role', 'dietary_compatible'];
    let score = 0;

    if (source) {
      const distance = macroDistance(source, food);
      const macroScore = Math.max(0, WEIGHTS.macroCompatibilityMax * (1 - distance));
      score += macroScore;
      if (distance < 0.25) reasons.push('macro_compatible');
    }

    const candidateCalories = food.calories;
    if (query.targetCalories > 0) {
      const calorieDiffRatio = Math.min(Math.abs(candidateCalories - query.targetCalories) / query.targetCalories, 1);
      const calorieScore = WEIGHTS.calorieCompatibilityMax * (1 - calorieDiffRatio);
      score += calorieScore;
      if (calorieDiffRatio < 0.3) reasons.push('calorie_compatible');
    }

    if (BUDGET_ORDER[food.budgetTier] <= BUDGET_ORDER[query.budgetTier]) {
      score += WEIGHTS.budgetFit;
      reasons.push('budget_fit');
    }

    if (food.region === 'egyptian_mena') {
      score += WEIGHTS.regionRelevant;
      reasons.push('region_relevant');
    }

    const preference = query.preferenceByFoodId?.[food.id];
    if (preference === 'liked') {
      score += WEIGHTS.preferenceLiked;
      reasons.push('previously_preferred');
    } else if (preference === 'frequently_logged') {
      score += WEIGHTS.preferenceFrequentlyLogged;
      reasons.push('previously_preferred');
    } else if (preference === 'frequently_replaced') {
      score += WEIGHTS.preferenceFrequentlyReplaced;
    } else if (preference === 'disliked') {
      score += WEIGHTS.preferenceDisliked;
    }

    if (query.recentlyUsedFoodIds?.includes(food.id)) {
      score += WEIGHTS.recentlyUsedPenalty;
    } else {
      reasons.push('variety');
    }

    candidates.push({ food, score, reasons });
  }

  candidates.sort((a, b) => b.score - a.score || a.food.id.localeCompare(b.food.id));
  return candidates;
}

export interface FoodAthleteConstraints {
  dietaryPreference: DietaryPreference;
  allergyIds: string[];
  budgetTier: 'low' | 'medium' | 'high';
  preferenceByFoodId?: Record<string, FoodPreferenceSignal>;
  recentlyUsedFoodIds?: string[];
}

/** Convenience wrapper mirroring the exercise matching engine's `suggestReplacements`:
 * infers role/target calories from the source food itself so callers (UI, AI Coach)
 * don't have to re-derive them. */
export function suggestFoodAlternatives(
  sourceFoodId: string,
  role: MealRole,
  constraints: FoodAthleteConstraints,
  limit = 5
): FoodMatchCandidate[] {
  const source = getFood(sourceFoodId);
  const query: FoodMatchQuery = {
    sourceFoodId,
    role,
    targetCalories: source?.calories ?? 0,
    dietaryPreference: constraints.dietaryPreference,
    allergyIds: constraints.allergyIds,
    budgetTier: constraints.budgetTier,
    preferenceByFoodId: constraints.preferenceByFoodId,
    recentlyUsedFoodIds: constraints.recentlyUsedFoodIds,
  };
  return findFoodAlternatives(query).slice(0, limit);
}
