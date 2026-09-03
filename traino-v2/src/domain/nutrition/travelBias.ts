import type { FoodCategory, FoodDefinition } from './types';

/**
 * Travel Mode nutrition bias (spec §7/§8) — lives inside the Nutrition Engine
 * (not domain/context/) so the dependency direction stays one-way: Travel
 * Mode reads from Nutrition, Nutrition never imports from Travel Mode.
 *
 * `isReadyToEat` is a deterministic CATEGORY-level heuristic ("does this kind
 * of food typically need cooking/preparation?"), not a per-food fabricated
 * fact and never a hard filter — it only nudges Meal Builder's ranking
 * (see mealBuilder.ts's `preferReadyToEat`), same weight class as its other
 * ranking-only bonuses (region/preference/variety).
 */
const READY_TO_EAT_CATEGORIES: FoodCategory[] = ['fruit', 'nut_seed', 'dairy', 'fat_oil'];

export const READY_TO_EAT_BONUS = 6;

export function isReadyToEat(food: FoodDefinition): boolean {
  return READY_TO_EAT_CATEGORIES.includes(food.category);
}
