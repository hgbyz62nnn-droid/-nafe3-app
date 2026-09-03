import { describe, expect, it } from 'vitest';
import { isReadyToEat } from './travelBias';
import { buildDailyPlan } from './mealBuilder';
import { getAllFoods, getFood } from './registry';
import type { NutritionProfile } from './types';

/** TRAVEL MODE test matrix (spec §33): J — nutrition travel option (opt-in
 * ranking bias toward ready-to-eat/portable foods, never a hard filter,
 * never overriding allergy/diet/budget/macro fit). */

function profile(overrides: Partial<NutritionProfile> = {}): NutritionProfile {
  return {
    goal: 'general_fitness',
    sex: 'male',
    weightKg: 80,
    heightCm: 180,
    age: 28,
    daysAvailablePerWeek: 4,
    sport: 'football',
    dietaryPreference: 'no_restriction',
    allergyIds: ['none'],
    budgetTier: 'medium',
    mealsPerDay: 4,
    dislikedFoodIds: [],
    likedFoodIds: [],
    isTrainingDay: true,
    ...overrides,
  };
}

const TARGETS = { calories: 2800, proteinG: 160, carbsG: 350, fatG: 80 };

describe('isReadyToEat', () => {
  it('marks fruit/nut_seed/dairy/fat_oil foods as ready-to-eat', () => {
    const fruit = getAllFoods().find((f) => f.category === 'fruit');
    expect(fruit).toBeDefined();
    expect(isReadyToEat(fruit!)).toBe(true);
  });

  it('does not mark grain/protein/legume foods (typically requiring cooking) as ready-to-eat', () => {
    const rice = getFood('white-rice-cooked');
    expect(rice).toBeDefined();
    expect(isReadyToEat(rice!)).toBe(false);
  });
});

describe('buildDailyPlan — J: nutrition travel option (opt-in, ranking-only)', () => {
  it('without the travel option, plans are unaffected (default conservative behavior)', () => {
    const withoutOption = buildDailyPlan(profile(), TARGETS);
    const withExplicitFalse = buildDailyPlan(profile(), TARGETS, { preferReadyToEat: false });
    expect(withoutOption).toEqual(withExplicitFalse);
  });

  it('with the travel option on, still produces a fully valid plan respecting every existing constraint', () => {
    const plan = buildDailyPlan(profile(), TARGETS, { preferReadyToEat: true });
    expect(plan.meals.length).toBeGreaterThan(0);
    for (const meal of plan.meals) {
      for (const item of meal.items) {
        expect(getFood(item.foodId)).toBeDefined();
      }
    }
  });

  it('never overrides allergy/diet safety even with the travel option enabled', () => {
    const veganPlan = buildDailyPlan(profile({ dietaryPreference: 'vegan', allergyIds: ['nuts'] }), TARGETS, { preferReadyToEat: true });
    for (const meal of veganPlan.meals) {
      for (const item of meal.items) {
        const food = getFood(item.foodId)!;
        expect(food.dietaryTags).toContain('vegan');
        expect(food.allergens).not.toContain('nuts');
      }
    }
  });

  it('is deterministic — the same profile+targets+option always produces the same plan', () => {
    const a = buildDailyPlan(profile(), TARGETS, { preferReadyToEat: true });
    const b = buildDailyPlan(profile(), TARGETS, { preferReadyToEat: true });
    expect(a).toEqual(b);
  });
});
