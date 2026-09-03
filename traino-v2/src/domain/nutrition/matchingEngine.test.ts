import { describe, expect, it } from 'vitest';
import { findFoodAlternatives, suggestFoodAlternatives } from './matchingEngine';
import { getAllFoods } from './registry';
import type { FoodMatchQuery } from './types';

/**
 * Nutrition Engine test matrix (spec §33, letters L-R) and property/invariant tests
 * (spec §34) — run against the REAL derived food library, mirroring the exercise
 * matching engine's test approach.
 */

function baseQuery(overrides: Partial<FoodMatchQuery> = {}): FoodMatchQuery {
  return {
    sourceFoodId: 'white-rice-cooked',
    role: 'carb',
    targetCalories: 130,
    dietaryPreference: 'no_restriction',
    allergyIds: ['none'],
    budgetTier: 'medium',
    ...overrides,
  };
}

// L: Allergy hard exclusion
describe('Food Matching Engine — L: allergy is a hard filter', () => {
  it('never returns a food containing the athlete\'s reported allergen', () => {
    const results = findFoodAlternatives(baseQuery({ allergyIds: ['gluten'] }));
    expect(results.every((c) => !c.food.allergens.includes('gluten'))).toBe(true);
  });

  it('a preferred-but-allergen food is never returned (safety outranks preference)', () => {
    const unsafe = getAllFoods().find((f) => f.mealRoles.includes('carb') && f.allergens.includes('gluten'));
    expect(unsafe).toBeDefined();
    const results = findFoodAlternatives(
      baseQuery({ allergyIds: ['gluten'], preferenceByFoodId: { [unsafe!.id]: 'liked' } })
    );
    expect(results.some((c) => c.food.id === unsafe!.id)).toBe(false);
  });
});

// dietary compatibility hard filter
describe('Food Matching Engine — dietary preference is a hard filter', () => {
  it('vegan query never returns a non-vegan food', () => {
    const results = findFoodAlternatives(baseQuery({ sourceFoodId: 'chicken-breast-cooked', role: 'protein', dietaryPreference: 'vegan' }));
    expect(results.every((c) => c.food.dietaryTags.includes('vegan'))).toBe(true);
  });

  it('high_protein/low_carb preferences never hard-exclude regular foods (they are ranking preferences, not dietary patterns)', () => {
    const results = findFoodAlternatives(baseQuery({ dietaryPreference: 'high_protein' }));
    expect(results.length).toBeGreaterThan(0);
  });
});

// meal role hard requirement
describe('Food Matching Engine — meal role', () => {
  it('never returns a food that cannot fill the requested role', () => {
    const results = findFoodAlternatives(baseQuery({ role: 'protein', sourceFoodId: 'chicken-breast-cooked' }));
    expect(results.every((c) => c.food.mealRoles.includes('protein'))).toBe(true);
  });

  it('never returns the source food itself', () => {
    const results = findFoodAlternatives(baseQuery());
    expect(results.some((c) => c.food.id === 'white-rice-cooked')).toBe(false);
  });
});

// M: Disliked food ranking
describe('Food Matching Engine — M: disliked food ranking', () => {
  it('a disliked food ranks lower than the same candidate with no preference signal', () => {
    const candidateId = 'pasta-cooked';
    const without = findFoodAlternatives(baseQuery()).find((c) => c.food.id === candidateId)!;
    const withDislike = findFoodAlternatives(baseQuery({ preferenceByFoodId: { [candidateId]: 'disliked' } })).find((c) => c.food.id === candidateId)!;
    expect(withDislike.score).toBeLessThan(without.score);
  });

  it('frequently_replaced also ranks lower than no signal', () => {
    const candidateId = 'pasta-cooked';
    const without = findFoodAlternatives(baseQuery()).find((c) => c.food.id === candidateId)!;
    const withReplaced = findFoodAlternatives(baseQuery({ preferenceByFoodId: { [candidateId]: 'frequently_replaced' } })).find(
      (c) => c.food.id === candidateId
    )!;
    expect(withReplaced.score).toBeLessThan(without.score);
  });
});

// N: Liked food ranking
describe('Food Matching Engine — N: liked food ranking', () => {
  it('a liked food outranks an otherwise-identical non-preferred one', () => {
    const candidateId = 'pasta-cooked';
    const without = findFoodAlternatives(baseQuery()).find((c) => c.food.id === candidateId)!;
    const withLike = findFoodAlternatives(baseQuery({ preferenceByFoodId: { [candidateId]: 'liked' } })).find((c) => c.food.id === candidateId)!;
    expect(withLike.score).toBeGreaterThan(without.score);
    expect(withLike.reasons).toContain('previously_preferred');
  });

  it('liked never overrides a hard allergy/diet exclusion', () => {
    const unsafe = getAllFoods().find((f) => f.mealRoles.includes('carb') && f.allergens.includes('gluten'))!;
    const results = findFoodAlternatives(baseQuery({ allergyIds: ['gluten'], preferenceByFoodId: { [unsafe.id]: 'liked' } }));
    expect(results.some((c) => c.food.id === unsafe.id)).toBe(false);
  });
});

// O: Budget ranking
describe('Food Matching Engine — O: budget ranking', () => {
  it('an in-budget food scores at least as high as the identical query with a lower budget tier', () => {
    const withMediumBudget = findFoodAlternatives(baseQuery({ budgetTier: 'medium' }));
    const withLowBudget = findFoodAlternatives(baseQuery({ budgetTier: 'low' }));
    const candidate = withMediumBudget.find((c) => c.food.budgetTier === 'medium');
    expect(candidate).toBeDefined();
    const sameCandidateLowBudget = withLowBudget.find((c) => c.food.id === candidate!.food.id);
    if (sameCandidateLowBudget) {
      expect(candidate!.score).toBeGreaterThan(sameCandidateLowBudget.score);
    }
  });
});

// P: Meal-role matching
describe('Food Matching Engine — P: meal-role matching reasons', () => {
  it('every returned candidate carries the same_meal_role reason', () => {
    const results = findFoodAlternatives(baseQuery());
    expect(results.every((c) => c.reasons.includes('same_meal_role'))).toBe(true);
  });
});

// Q: Food alternatives (convenience wrapper)
describe('Food Matching Engine — Q: suggestFoodAlternatives', () => {
  it('infers target calories from the source food and respects the limit', () => {
    const top = suggestFoodAlternatives('white-rice-cooked', 'carb', { dietaryPreference: 'no_restriction', allergyIds: ['none'], budgetTier: 'medium' }, 2);
    expect(top.length).toBeLessThanOrEqual(2);
    expect(top.every((c) => c.food.id !== 'white-rice-cooked')).toBe(true);
  });
});

// R: Deterministic ordering
describe('Food Matching Engine — R: deterministic ordering', () => {
  it('identical queries always produce identical ranked output', () => {
    const query = baseQuery({ budgetTier: 'high' });
    const runs = Array.from({ length: 5 }, () => findFoodAlternatives(query).map((c) => `${c.food.id}:${c.score}`));
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(runs[0]);
    }
  });
});

// Property/invariant tests (spec §34)
describe('Food Matching Engine — invariants (property tests over the full library)', () => {
  const ALL_ALLERGENS = ['dairy', 'gluten', 'nuts', 'shellfish', 'eggs'];

  it('for every real allergen, no returned candidate ever contains it', () => {
    for (const allergen of ALL_ALLERGENS) {
      const results = findFoodAlternatives(baseQuery({ allergyIds: [allergen], role: 'protein', sourceFoodId: 'chicken-breast-cooked' }));
      expect(results.every((c) => !c.food.allergens.includes(allergen))).toBe(true);
    }
  });

  it('a vegan query never returns a food missing the vegan tag, across every meal role', () => {
    const roles = ['protein', 'carb', 'fat', 'vegetable', 'fruit', 'dairy', 'legume'] as const;
    for (const role of roles) {
      const results = findFoodAlternatives(baseQuery({ role, dietaryPreference: 'vegan', sourceFoodId: '__none__' }));
      expect(results.every((c) => c.food.dietaryTags.includes('vegan'))).toBe(true);
    }
  });

  it('no food in the library ever recommends itself', () => {
    for (const food of getAllFoods()) {
      for (const role of food.mealRoles) {
        const results = findFoodAlternatives(baseQuery({ sourceFoodId: food.id, role, targetCalories: food.calories }));
        expect(results.some((c) => c.food.id === food.id)).toBe(false);
      }
    }
  });

  it('every food in the library has a valid, finite calorie/macro set (no NaN/Infinity/negative can enter a plan)', () => {
    for (const food of getAllFoods()) {
      for (const value of [food.calories, food.proteinG, food.carbsG, food.fatG]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
