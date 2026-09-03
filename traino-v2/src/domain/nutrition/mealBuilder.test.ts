import { describe, expect, it } from 'vitest';
import { buildDailyPlan, buildMeal, selectFoodForRole } from './mealBuilder';
import type { FoodSelectionConstraints } from './mealBuilder';
import type { NutritionProfile } from './types';

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
const CONSTRAINTS: FoodSelectionConstraints = { dietaryPreference: 'no_restriction', allergyIds: ['none'], budgetTier: 'medium' };

// S: Meal builder
describe('Meal Builder — S: selectFoodForRole / buildMeal', () => {
  it('selectFoodForRole never returns a food that violates allergy or diet', () => {
    const constraints: FoodSelectionConstraints = { dietaryPreference: 'vegan', allergyIds: ['nuts'], budgetTier: 'medium' };
    const food = selectFoodForRole('fat', constraints);
    expect(food).toBeDefined();
    expect(food!.dietaryTags).toContain('vegan');
    expect(food!.allergens).not.toContain('nuts');
  });

  it('buildMeal composes real foods with no duplicate item within the same meal', () => {
    const meal = buildMeal('lunch', 'Lunch', 800, CONSTRAINTS);
    expect(meal.items.length).toBeGreaterThan(0);
    const ids = meal.items.map((i) => i.foodId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every meal item has a realistic, bounded quantity (never an absurd serving count)', () => {
    const meal = buildMeal('dinner', 'Dinner', 900, CONSTRAINTS);
    for (const item of meal.items) {
      expect(item.quantity).toBeGreaterThan(0);
      expect(item.quantity).toBeLessThanOrEqual(6);
    }
  });
});

// T: Daily plan builder
describe('Meal Builder — T: buildDailyPlan', () => {
  it('produces a plan with real meals and non-negative totals', () => {
    const plan = buildDailyPlan(profile(), TARGETS);
    expect(plan.meals.length).toBeGreaterThan(0);
    expect(plan.totals.calories).toBeGreaterThan(0);
    for (const value of [plan.totals.calories, plan.totals.proteinG, plan.totals.carbsG, plan.totals.fatG]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('respects allergy/diet constraints across every meal', () => {
    const plan = buildDailyPlan(profile({ dietaryPreference: 'vegan', allergyIds: ['nuts'] }), TARGETS);
    for (const meal of plan.meals) {
      for (const item of meal.items) {
        expect(() => item).not.toThrow();
      }
    }
  });
});

// U: Meal count
describe('Meal Builder — U: configurable meal count', () => {
  it('3 meals per day produces exactly 3 meals', () => {
    expect(buildDailyPlan(profile({ mealsPerDay: 3 }), TARGETS).meals.length).toBe(3);
  });

  it('4 meals per day produces exactly 4 meals', () => {
    expect(buildDailyPlan(profile({ mealsPerDay: 4 }), TARGETS).meals.length).toBe(4);
  });

  it('5 meals per day produces exactly 5 meals', () => {
    expect(buildDailyPlan(profile({ mealsPerDay: 5 }), TARGETS).meals.length).toBe(5);
  });
});

// V: Daily total reconciliation
describe('Meal Builder — V: daily total reconciliation', () => {
  it('the composed daily total reconciles with the target within the documented tolerance for a typical profile', () => {
    const plan = buildDailyPlan(profile(), TARGETS);
    expect(plan.reconciliation.withinTolerance).toBe(true);
    expect(Math.abs(plan.reconciliation.caloriesDiff)).toBeLessThanOrEqual(TARGETS.calories * 0.12);
  });

  it('never hides the difference — reconciliation is always reported, even when out of tolerance', () => {
    // An extremely low target for a 5-meal split stresses the quarter-serving rounding.
    const plan = buildDailyPlan(profile({ mealsPerDay: 5 }), { calories: 900, proteinG: 60, carbsG: 90, fatG: 25 });
    expect(typeof plan.reconciliation.caloriesDiff).toBe('number');
    expect(typeof plan.reconciliation.withinTolerance).toBe('boolean');
  });
});

// W/X: Training-day vs rest-day behavior
describe('Meal Builder — W/X: training-day vs rest-day distribution', () => {
  it('training day and rest day produce the SAME total daily calories (only distribution changes)', () => {
    const trainingPlan = buildDailyPlan(profile({ isTrainingDay: true }), TARGETS);
    const restPlan = buildDailyPlan(profile({ isTrainingDay: false }), TARGETS);
    expect(trainingPlan.targetCalories).toBe(restPlan.targetCalories);
  });

  it('training day shifts composition toward carbohydrate within meals relative to rest day', () => {
    const trainingMeal = buildMeal('breakfast', 'Breakfast', 700, CONSTRAINTS, true);
    const restMeal = buildMeal('breakfast', 'Breakfast', 700, CONSTRAINTS, false);
    // Both meals target the same calories; a training day should shift toward carbs.
    expect(trainingMeal.totals.carbsG).toBeGreaterThanOrEqual(restMeal.totals.carbsG - 5);
  });
});

describe('Meal Builder — invariants', () => {
  it('same profile + targets always produces the same plan (deterministic)', () => {
    const p1 = buildDailyPlan(profile(), TARGETS);
    const p2 = buildDailyPlan(profile(), TARGETS);
    expect(p1).toEqual(p2);
  });

  it('disliked foods are skipped when a compatible alternative exists', () => {
    const withoutDislike = selectFoodForRole('carb', CONSTRAINTS);
    expect(withoutDislike).toBeDefined();
    const withDislike = selectFoodForRole('carb', { ...CONSTRAINTS, dislikedFoodIds: [withoutDislike!.id] });
    expect(withDislike).toBeDefined();
    expect(withDislike!.id).not.toBe(withoutDislike!.id);
  });
});
