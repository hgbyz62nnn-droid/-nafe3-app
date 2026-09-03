import type { FoodCategory, FoodDefinition } from './types';
import type { DietaryPreference } from '../engine/types';
import { FOOD_LIBRARY } from './foods';
import { validateFoodLibrary } from './validateFoodLibrary';

/**
 * Food Registry — the single, validated, read-only entry point onto the
 * Food Library. Mirrors `domain/exercise/registry.ts`'s "derive, validate
 * at import time, expose read-only lookups" contract exactly.
 */
const LIBRARY: readonly FoodDefinition[] = Object.freeze(FOOD_LIBRARY.map((f) => Object.freeze(f)));

// Fail fast: a malformed food library must never silently reach the Meal Builder.
validateFoodLibrary(LIBRARY as FoodDefinition[]);

const BY_ID = new Map<string, FoodDefinition>(LIBRARY.map((f) => [f.id, f]));

const BY_NAME = new Map<string, string>();
for (const food of LIBRARY) {
  BY_NAME.set(food.canonicalName.toLowerCase(), food.id);
  for (const alias of food.aliases) {
    BY_NAME.set(alias.toLowerCase(), food.id);
  }
}

export function getFood(id: string): FoodDefinition | undefined {
  return BY_ID.get(id);
}

/** Case-insensitive lookup by canonical name or any known alias. */
export function getFoodByName(name: string): FoodDefinition | undefined {
  const id = BY_NAME.get(name.toLowerCase());
  return id ? BY_ID.get(id) : undefined;
}

export interface FoodSearchCriteria {
  category?: FoodCategory;
  mealRole?: FoodDefinition['mealRoles'][number];
  dietaryPreference?: DietaryPreference;
  region?: FoodDefinition['region'];
}

/** Generic, deterministic filtering — every criterion supplied must match. */
export function searchFoods(criteria: FoodSearchCriteria): FoodDefinition[] {
  return LIBRARY.filter((f) => {
    if (criteria.category && f.category !== criteria.category) return false;
    if (criteria.mealRole && !f.mealRoles.includes(criteria.mealRole)) return false;
    if (criteria.dietaryPreference && !f.dietaryTags.includes(criteria.dietaryPreference)) return false;
    if (criteria.region && f.region !== criteria.region) return false;
    return true;
  });
}

export function getFoodsByCategory(category: FoodCategory): FoodDefinition[] {
  return LIBRARY.filter((f) => f.category === category);
}

export function getFoodsByDiet(diet: DietaryPreference): FoodDefinition[] {
  return LIBRARY.filter((f) => f.dietaryTags.includes(diet));
}

/** Read-only snapshot of the full library — never mutate the returned array or its
 * entries; both are frozen. */
export function getAllFoods(): readonly FoodDefinition[] {
  return LIBRARY;
}
