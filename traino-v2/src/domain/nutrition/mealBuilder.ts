import type { BudgetTier, DietaryPreference } from '../engine/types';
import type { DailyNutritionPlan, FoodDefinition, FoodPreferenceSignal, MealRole, MealTotals, NutritionProfile, PlannedFoodItem, PlannedMeal } from './types';
import { getAllFoods } from './registry';
import { MEAL_DISTRIBUTIONS } from './mealDistribution';

/**
 * Deterministic Meal Builder + Daily Plan Builder (spec §11/§12). Composes
 * a handful of real FoodDefinition components per meal — never a
 * hardcoded meal combination, never a generated/invented food. The same
 * profile + targets + food library always produces the same plan (spec
 * §31) unless the athlete's own preference/history data changes.
 */

/** Which meal-composition roles a slot draws from, and each role's share of that
 * slot's calorie target — a small, documented, generic table (not a per-athlete
 * guess). 'breakfast'/'lunch'/'dinner'/'snack*' are the only slot-id shapes
 * MEAL_DISTRIBUTIONS produces; an unrecognized slot id falls back to a balanced
 * protein+carb+vegetable meal so the builder never throws on a new distribution. */
const DEFAULT_ROLE_SHARES: Record<string, Partial<Record<MealRole, number>>> = {
  breakfast: { carb: 0.45, protein: 0.35, dairy: 0.2 },
  lunch: { protein: 0.4, carb: 0.35, vegetable: 0.25 },
  dinner: { protein: 0.4, carb: 0.35, vegetable: 0.25 },
  snack: { protein: 0.5, fruit: 0.5 },
  snack_1: { protein: 0.5, fruit: 0.5 },
  snack_2: { protein: 0.5, fruit: 0.5 },
};
const FALLBACK_ROLE_SHARES: Partial<Record<MealRole, number>> = { protein: 0.4, carb: 0.35, vegetable: 0.25 };

/** Training-day carbohydrate emphasis (spec §7): shifts calorie share from fat/dairy
 * toward carb WITHIN each meal's own composition — it never changes that meal's or the
 * day's total calorie target, only what the calories are made of. Fixed, documented,
 * never randomized. */
const TRAINING_DAY_CARB_BUMP = 0.1;

function applyTrainingDayShift(roleShares: Partial<Record<MealRole, number>>, isTrainingDay: boolean): Partial<Record<MealRole, number>> {
  if (!isTrainingDay || roleShares.carb === undefined) return roleShares;
  const donorRole: MealRole | undefined = roleShares.fat !== undefined ? 'fat' : roleShares.dairy !== undefined ? 'dairy' : undefined;
  if (!donorRole) return roleShares;
  const donorShare = roleShares[donorRole]!;
  const bump = Math.min(TRAINING_DAY_CARB_BUMP, donorShare * 0.5);
  return { ...roleShares, carb: roleShares.carb + bump, [donorRole]: donorShare - bump };
}

const BUDGET_ORDER: Record<BudgetTier, number> = { low: 0, medium: 1, high: 2 };

/** 'high_protein'/'low_carb' are ranking preferences, never a hard exclusion — same
 * convention as matchingEngine.ts. */
function dietHardFilterKey(pref: DietaryPreference): DietaryPreference {
  return pref === 'high_protein' || pref === 'low_carb' ? 'no_restriction' : pref;
}

function isAllergySafe(food: FoodDefinition, allergyIds: string[]): boolean {
  const activeAllergies = allergyIds.filter((id) => id !== 'none');
  return !food.allergens.some((a) => activeAllergies.includes(a));
}

export interface FoodSelectionConstraints {
  dietaryPreference: DietaryPreference;
  allergyIds: string[];
  budgetTier: BudgetTier;
  dislikedFoodIds?: string[];
  likedFoodIds?: string[];
  preferenceByFoodId?: Record<string, FoodPreferenceSignal>;
  /** Ranking-only nudge away from these ids (cross-meal variety) — never leaves a role
   * unfilled just to enforce variety. */
  recentlyUsedFoodIds?: string[];
  /** Hard-avoid within THIS meal only, so the same food is never picked twice as two
   * separate line items (e.g. one food qualifying for both 'protein' and 'dairy'
   * roles) — relaxed back to the full candidate pool only if nothing else qualifies. */
  excludeFoodIds?: string[];
  /** Deterministically spreads the pick among equally-top-ranked candidates (e.g.
   * `${slotId}:${role}`) so, absent any preference/history signal, breakfast and
   * dinner don't always land on the exact same food — never introduces randomness:
   * the same seed always resolves to the same food. */
  varietySeed?: string;
  /** How many calories this role needs to cover in the meal — used only to steer away
   * from a food whose natural serving size would need an unrealistic quantity to hit
   * that target (e.g. 19 egg whites), never to change safety/diet/budget filtering. */
  roleCalorieTarget?: number;
}

/** A realistic single-food portion stays within this many servings of its own
 * reference size — a low-calorie-density food (egg whites, cucumber) covering a large
 * role target on its own is the sign the Meal Builder needs a different, more
 * calorie-dense candidate for that role, not a huge quantity of the same food. */
const REALISTIC_QUANTITY_RANGE = { min: 0.3, max: 4 };
/** Hard ceiling applied after selection regardless of ranking — a last-resort safety
 * net so no plan can ever show an absurd serving count even in a degenerate case. */
const MAX_QUANTITY_SERVINGS = 6;

/** Small, deterministic string hash (no crypto dependency needed) — used only to
 * spread ties across a fixed candidate list, never for anything security-sensitive. */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Picks one deterministic, safe, diet-compatible food for a given role.
 * Never returns a food that violates an allergy or the athlete's dietary
 * pattern (spec §15/§16 — hard filters, never relaxed). Budget is relaxed
 * only if nothing in-budget qualifies (spec §14 — a ranking signal, never
 * a mandate that leaves a slot empty). Disliked foods are skipped only
 * when a compatible alternative still exists (spec §17).
 */
export function selectFoodForRole(role: MealRole, constraints: FoodSelectionConstraints): FoodDefinition | null {
  const dietKey = dietHardFilterKey(constraints.dietaryPreference);
  const safe = getAllFoods().filter(
    (f) => f.mealRoles.includes(role) && f.dietaryTags.includes(dietKey) && isAllergySafe(f, constraints.allergyIds)
  );
  if (safe.length === 0) return null;

  const disliked = constraints.dislikedFoodIds ?? [];
  const withoutDisliked = safe.filter((f) => !disliked.includes(f.id));
  const pool = withoutDisliked.length > 0 ? withoutDisliked : safe;

  const inBudget = pool.filter((f) => BUDGET_ORDER[f.budgetTier] <= BUDGET_ORDER[constraints.budgetTier]);
  const budgeted = inBudget.length > 0 ? inBudget : pool;

  const excluded = constraints.excludeFoodIds ?? [];
  const withoutExcluded = budgeted.filter((f) => !excluded.includes(f.id));
  const candidates = withoutExcluded.length > 0 ? withoutExcluded : budgeted;

  const liked = new Set(constraints.likedFoodIds ?? []);
  const recentlyUsed = new Set(constraints.recentlyUsedFoodIds ?? []);

  function rank(food: FoodDefinition): number {
    let score = 0;
    if (liked.has(food.id)) score += 20;
    const signal = constraints.preferenceByFoodId?.[food.id];
    if (signal === 'liked') score += 15;
    else if (signal === 'frequently_logged') score += 6;
    else if (signal === 'frequently_replaced') score -= 10;
    else if (signal === 'disliked') score -= 20;
    if (food.region === 'egyptian_mena') score += 2;
    if (recentlyUsed.has(food.id)) score -= 5;
    if (constraints.roleCalorieTarget && food.calories > 0) {
      const impliedQuantity = constraints.roleCalorieTarget / food.calories;
      if (impliedQuantity > REALISTIC_QUANTITY_RANGE.max) score -= (impliedQuantity - REALISTIC_QUANTITY_RANGE.max) * 4;
      else if (impliedQuantity < REALISTIC_QUANTITY_RANGE.min) score -= (REALISTIC_QUANTITY_RANGE.min - impliedQuantity) * 4;
    }
    return score;
  }

  const bestScore = Math.max(...candidates.map(rank));
  const topTied = candidates.filter((f) => rank(f) === bestScore).sort((a, b) => a.id.localeCompare(b.id));
  if (topTied.length === 1 || !constraints.varietySeed) return topTied[0];
  return topTied[hashString(constraints.varietySeed) % topTied.length];
}

/** Composes one meal for a slot by picking one food per role in that slot's role-set,
 * each quantity-scaled to its allocated share of the slot's calorie target. */
export function buildMeal(
  slotId: string,
  slotLabel: string,
  targetCalories: number,
  constraints: FoodSelectionConstraints,
  isTrainingDay = false
): PlannedMeal {
  const baseRoleShares = DEFAULT_ROLE_SHARES[slotId] ?? FALLBACK_ROLE_SHARES;
  const roleShares = applyTrainingDayShift(baseRoleShares, isTrainingDay);

  const items: PlannedFoodItem[] = [];
  const usedInThisMeal: string[] = [];
  for (const [role, share] of Object.entries(roleShares) as [MealRole, number][]) {
    const roleCalorieTarget = targetCalories * share;
    const food = selectFoodForRole(role, {
      ...constraints,
      excludeFoodIds: [...(constraints.excludeFoodIds ?? []), ...usedInThisMeal],
      varietySeed: `${slotId}:${role}`,
      roleCalorieTarget,
    });
    if (!food) continue;
    usedInThisMeal.push(food.id);
    // Quantity in servings, rounded to a practical quarter-serving, bounded to a
    // realistic single-food portion (spec §12 "practical") — never below a quarter
    // serving, never above the hard MAX_QUANTITY_SERVINGS safety net.
    const rawQuantity = food.calories > 0 ? roleCalorieTarget / food.calories : 0;
    const quantity = Math.min(MAX_QUANTITY_SERVINGS, Math.max(0.25, Math.round(rawQuantity * 4) / 4));
    items.push({
      foodId: food.id,
      role,
      quantity,
      calories: Math.round(food.calories * quantity),
      proteinG: Math.round(food.proteinG * quantity * 10) / 10,
      carbsG: Math.round(food.carbsG * quantity * 10) / 10,
      fatG: Math.round(food.fatG * quantity * 10) / 10,
    });
  }

  const totals = items.reduce<MealTotals>(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      proteinG: sum.proteinG + item.proteinG,
      carbsG: sum.carbsG + item.carbsG,
      fatG: sum.fatG + item.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

  return { slotId, slotLabel, items, totals };
}

/** How far the composed daily total may land from the target and still count as
 * reconciled — a documented tolerance (spec §12: "never hide calculation
 * differences"), not silently accepted drift. Quantized quarter-serving rounding
 * across several meals can realistically land ~10% off a small target. */
const DAILY_CALORIE_TOLERANCE_RATIO = 0.12;

export function buildDailyPlan(profile: NutritionProfile, targets: { calories: number; proteinG: number; carbsG: number; fatG: number }): DailyNutritionPlan {
  const distribution = MEAL_DISTRIBUTIONS[profile.mealsPerDay];
  const constraints: FoodSelectionConstraints = {
    dietaryPreference: profile.dietaryPreference,
    allergyIds: profile.allergyIds,
    budgetTier: profile.budgetTier,
    dislikedFoodIds: profile.dislikedFoodIds,
    likedFoodIds: profile.likedFoodIds,
  };

  // Cross-meal variety: each meal is nudged (never hard-blocked) away from foods
  // already used earlier the same day, so a 4-meal plan doesn't repeat the exact
  // same protein/carb pairing at both lunch and dinner when real alternatives exist.
  const usedAcrossDay: string[] = [];
  const meals = distribution.map((slot) => {
    const meal = buildMeal(
      slot.slotId,
      slot.slotLabel,
      targets.calories * slot.share,
      { ...constraints, recentlyUsedFoodIds: [...usedAcrossDay] },
      profile.isTrainingDay
    );
    usedAcrossDay.push(...meal.items.map((i) => i.foodId));
    return meal;
  });

  const totals = meals.reduce<MealTotals>(
    (sum, meal) => ({
      calories: sum.calories + meal.totals.calories,
      proteinG: sum.proteinG + meal.totals.proteinG,
      carbsG: sum.carbsG + meal.totals.carbsG,
      fatG: sum.fatG + meal.totals.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

  const caloriesDiff = totals.calories - targets.calories;
  const withinTolerance = targets.calories > 0 && Math.abs(caloriesDiff) <= targets.calories * DAILY_CALORIE_TOLERANCE_RATIO;

  return {
    targetCalories: targets.calories,
    targetProteinG: targets.proteinG,
    targetCarbsG: targets.carbsG,
    targetFatG: targets.fatG,
    meals,
    totals,
    reconciliation: { caloriesDiff, withinTolerance },
  };
}
