import type { AssessmentAnswers, MealPlanEntry, MealSlot, MealTemplate, NutritionTargets } from './types';
import { MEAL_LIBRARY } from '../nutrition/meals';

/**
 * Deterministic meal-plan selection: filters the static meal library by
 * the athlete's real preferences/allergies/budget, then picks whichever
 * eligible candidate's calories are closest to that slot's share of the
 * daily target. No meal is ever generated — only selected from
 * pre-authored data.
 */

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

const SLOT_CALORIE_SHARE: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.3,
  snack: 0.15,
  dinner: 0.3,
};

const BUDGET_ORDER: Record<AssessmentAnswers['budgetTier'], number> = { low: 0, medium: 1, high: 2 };

function allergenSafe(meal: MealTemplate, allergyIds: string[]): boolean {
  const activeAllergies = allergyIds.filter((id) => id !== 'none');
  return !meal.allergens.some((a) => activeAllergies.includes(a));
}

function dietOk(meal: MealTemplate, answers: AssessmentAnswers): boolean {
  return meal.dietaryTags.includes(answers.dietaryPreference);
}

function budgetOk(meal: MealTemplate, answers: AssessmentAnswers): boolean {
  return BUDGET_ORDER[meal.budgetTier] <= BUDGET_ORDER[answers.budgetTier];
}

/**
 * Candidates for a slot, relaxing budget then diet constraints (in that
 * order) if nothing matches — allergen safety is never relaxed.
 */
function candidatesForSlot(slot: MealSlot, answers: AssessmentAnswers): MealTemplate[] {
  const slotMeals = MEAL_LIBRARY.filter((m) => m.slot === slot && allergenSafe(m, answers.allergyIds));

  const strict = slotMeals.filter((m) => dietOk(m, answers) && budgetOk(m, answers));
  if (strict.length > 0) return strict;

  const dietOnly = slotMeals.filter((m) => dietOk(m, answers));
  if (dietOnly.length > 0) return dietOnly;

  return slotMeals;
}

function pickClosestToTarget(candidates: MealTemplate[], targetKcal: number): MealTemplate {
  return candidates.reduce((best, m) =>
    Math.abs(m.kcal - targetKcal) < Math.abs(best.kcal - targetKcal) ? m : best
  );
}

export function generateMealPlan(answers: AssessmentAnswers, targets: NutritionTargets): MealPlanEntry[] {
  return SLOT_ORDER.map((slot) => {
    const candidates = candidatesForSlot(slot, answers);
    const targetKcal = targets.calories * SLOT_CALORIE_SHARE[slot];
    const meal = pickClosestToTarget(candidates, targetKcal);
    return { slot, meal };
  });
}

/** Next eligible alternative for one slot, cycling deterministically past the current meal. */
export function getMealAlternative(slot: MealSlot, currentMealId: string, answers: AssessmentAnswers): MealTemplate {
  const candidates = candidatesForSlot(slot, answers);
  const currentIndex = candidates.findIndex((m) => m.id === currentMealId);
  const nextIndex = (currentIndex + 1) % candidates.length;
  return candidates[nextIndex];
}
