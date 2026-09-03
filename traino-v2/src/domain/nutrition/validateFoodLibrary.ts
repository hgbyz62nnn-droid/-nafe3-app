import type { FoodCategory, FoodDefinition, FoodRegion, MealRole, ServingUnit } from './types';
import type { BudgetTier, DietaryPreference } from '../engine/types';
import { ALLERGY_OPTIONS } from '../assessment/nutritionPreferences';

/**
 * Strict Food Library validator — the same "fail fast at import time"
 * contract `validateExerciseLibrary`/`validateSportModule` already use. A
 * malformed food must never silently reach the Meal Builder or a
 * generated plan.
 */

const VALID_CATEGORIES: Set<FoodCategory> = new Set([
  'grain', 'protein', 'dairy', 'vegetable', 'fruit', 'legume', 'fat_oil', 'nut_seed', 'beverage', 'mixed_dish',
]);
const VALID_MEAL_ROLES: Set<MealRole> = new Set(['protein', 'carb', 'fat', 'vegetable', 'fruit', 'dairy', 'legume', 'mixed']);
const VALID_SERVING_UNITS: Set<ServingUnit> = new Set(['g', 'ml', 'piece', 'cup', 'slice', 'tbsp']);
const VALID_REGIONS: Set<FoodRegion> = new Set(['egyptian_mena', 'general']);
const VALID_DIETARY_TAGS: Set<DietaryPreference> = new Set(['no_restriction', 'vegetarian', 'vegan', 'high_protein', 'low_carb']);
const VALID_BUDGET_TIERS: Set<BudgetTier> = new Set(['low', 'medium', 'high']);
const VALID_ALLERGEN_IDS = new Set(ALLERGY_OPTIONS.map((a) => a.id).filter((id) => id !== 'none'));

export class FoodLibraryValidationError extends Error {}

function fail(messages: string[]): never {
  throw new FoodLibraryValidationError(`Food Library validation failed:\n- ${messages.join('\n- ')}`);
}

function isFiniteNonNegative(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

export function validateFoodLibrary(library: FoodDefinition[]): void {
  const errors: string[] = [];
  const idSet = new Set<string>();
  const nameToIds = new Map<string, Set<string>>();

  for (const food of library) {
    if (!food.id || typeof food.id !== 'string') {
      errors.push(`a food has an empty/invalid id (canonicalName: "${food.canonicalName}")`);
      continue;
    }
    if (idSet.has(food.id)) errors.push(`duplicate food id "${food.id}"`);
    idSet.add(food.id);

    if (!food.canonicalName || food.canonicalName.trim().length === 0) {
      errors.push(`food "${food.id}" has an empty canonicalName`);
    }
    if (!VALID_CATEGORIES.has(food.category)) {
      errors.push(`food "${food.id}" has an invalid category "${food.category}"`);
    }
    if (!Array.isArray(food.mealRoles) || food.mealRoles.length === 0) {
      errors.push(`food "${food.id}" must have at least one mealRole`);
    } else {
      for (const role of food.mealRoles) {
        if (!VALID_MEAL_ROLES.has(role)) errors.push(`food "${food.id}" has an invalid mealRole "${role}"`);
      }
    }
    if (!VALID_SERVING_UNITS.has(food.servingUnit)) {
      errors.push(`food "${food.id}" has an invalid servingUnit "${food.servingUnit}"`);
    }
    if (!VALID_REGIONS.has(food.region)) {
      errors.push(`food "${food.id}" has an invalid region "${food.region}"`);
    }
    if (!VALID_BUDGET_TIERS.has(food.budgetTier)) {
      errors.push(`food "${food.id}" has an invalid budgetTier "${food.budgetTier}"`);
    }
    if (!(food.servingSize > 0)) {
      errors.push(`food "${food.id}" must have a servingSize > 0`);
    }
    for (const [field, value] of [
      ['calories', food.calories],
      ['proteinG', food.proteinG],
      ['carbsG', food.carbsG],
      ['fatG', food.fatG],
    ] as const) {
      if (!isFiniteNonNegative(value)) {
        errors.push(`food "${food.id}" has an invalid ${field} value (${value}) — must be a finite number >= 0`);
      }
    }
    if (food.fiberG !== undefined && !isFiniteNonNegative(food.fiberG)) {
      errors.push(`food "${food.id}" has an invalid fiberG value (${food.fiberG})`);
    }
    // Macro/calorie plausibility: protein+carb+fat calories (general 4/4/9 Atwater
    // factors) should land close to the stated calories — published whole-food figures
    // routinely diverge by up to ~15% (fiber, food-specific Atwater factors, source
    // rounding), so this is a generous sanity bound against a genuinely impossible
    // total, not a strict recomputation.
    const macroKcal = food.proteinG * 4 + food.carbsG * 4 + food.fatG * 9;
    if (macroKcal > food.calories * 1.15 + 8) {
      errors.push(`food "${food.id}" macro calories (${macroKcal.toFixed(1)}) exceed stated calories (${food.calories}) beyond tolerance`);
    }
    if (!Array.isArray(food.dietaryTags) || food.dietaryTags.length === 0) {
      errors.push(`food "${food.id}" must have at least one dietaryTag`);
    } else {
      for (const tag of food.dietaryTags) {
        if (!VALID_DIETARY_TAGS.has(tag)) errors.push(`food "${food.id}" has an invalid dietaryTag "${tag}"`);
      }
    }
    for (const allergen of food.allergens) {
      if (!VALID_ALLERGEN_IDS.has(allergen)) errors.push(`food "${food.id}" references an unknown allergen id "${allergen}"`);
    }
    if (!food.source || !food.sourceVersion) {
      errors.push(`food "${food.id}" is missing source/sourceVersion provenance`);
    }

    const names = [food.canonicalName.toLowerCase(), ...food.aliases.map((a) => a.toLowerCase())];
    for (const name of names) {
      if (!nameToIds.has(name)) nameToIds.set(name, new Set());
      nameToIds.get(name)!.add(food.id);
    }
  }

  for (const [name, ids] of nameToIds) {
    if (ids.size > 1) {
      errors.push(`the name/alias "${name}" resolves ambiguously to multiple foods: ${Array.from(ids).join(', ')}`);
    }
  }

  if (errors.length > 0) fail(errors);
}
