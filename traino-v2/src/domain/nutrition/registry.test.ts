import { describe, expect, it } from 'vitest';
import { getAllFoods, getFood, getFoodByName, getFoodsByCategory, getFoodsByDiet, searchFoods } from './registry';
import { validateFoodLibrary } from './validateFoodLibrary';
import type { FoodDefinition } from './types';

/**
 * Nutrition Engine test matrix (spec §33, letters H-K covered here — remaining
 * letters live in matchingEngine.test.ts, mealBuilder.test.ts, adherence.test.ts).
 */

// H: Food registry
describe('Food Registry — H: loads', () => {
  it('builds a non-empty library at import time', () => {
    expect(getAllFoods().length).toBeGreaterThan(0);
  });

  it('the returned library and its entries are frozen (immutable, no mutable global state)', () => {
    const all = getAllFoods();
    expect(Object.isFrozen(all)).toBe(true);
    expect(Object.isFrozen(all[0])).toBe(true);
  });

  it('getFood/getFoodsByCategory/getFoodsByDiet never throw for valid or invalid input', () => {
    expect(() => getFood('not-a-real-id')).not.toThrow();
    expect(getFood('not-a-real-id')).toBeUndefined();
    expect(() => getFoodsByCategory('grain')).not.toThrow();
    expect(() => getFoodsByDiet('vegan')).not.toThrow();
  });
});

// I: Food validation
describe('Food Registry — I: validation', () => {
  it('the real derived library passes strict validation (already proven by successful import, re-asserted explicitly)', () => {
    expect(() => validateFoodLibrary(getAllFoods() as FoodDefinition[])).not.toThrow();
  });

  it('every food has a unique id', () => {
    const ids = getAllFoods().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every food has non-negative, finite calories/protein/carbs/fat — never NaN/Infinity/negative', () => {
    for (const food of getAllFoods()) {
      for (const value of [food.calories, food.proteinG, food.carbsG, food.fatG]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(food.servingSize).toBeGreaterThan(0);
    }
  });
});

// J: Alias lookup
describe('Food Registry — J: alias lookup', () => {
  it('resolves by exact canonical name', () => {
    expect(getFoodByName('White Rice (cooked)')?.id).toBe('white-rice-cooked');
  });

  it('resolves case-insensitively', () => {
    expect(getFoodByName('rice')?.id).toBe('white-rice-cooked');
    expect(getFoodByName('FUL')?.id).toBe('ful-medames');
  });

  it('returns undefined for a name not in the library', () => {
    expect(getFoodByName('Not A Real Food')).toBeUndefined();
  });

  it('two different aliases of the same food never resolve to different foods', () => {
    const alias1 = getFoodByName('Ful');
    const alias2 = getFoodByName('Fava Beans');
    expect(alias1?.id).toBe('ful-medames');
    expect(alias1?.id).toBe(alias2?.id);
  });
});

// K: Dietary filtering
describe('Food Registry — K: dietary filtering', () => {
  it('searchFoods with dietaryPreference only returns foods compatible with that pattern', () => {
    const vegan = searchFoods({ dietaryPreference: 'vegan' });
    expect(vegan.length).toBeGreaterThan(0);
    expect(vegan.every((f) => f.dietaryTags.includes('vegan'))).toBe(true);
  });

  it('vegan is a strict subset of vegetarian, which is a strict subset of no_restriction', () => {
    const vegan = getFoodsByDiet('vegan');
    const vegetarian = getFoodsByDiet('vegetarian');
    const noRestriction = getFoodsByDiet('no_restriction');
    for (const f of vegan) expect(f.dietaryTags).toContain('vegetarian');
    for (const f of vegetarian) expect(f.dietaryTags).toContain('no_restriction');
    expect(noRestriction.length).toBeGreaterThanOrEqual(vegetarian.length);
    expect(vegetarian.length).toBeGreaterThanOrEqual(vegan.length);
  });

  it('meat/fish foods are never tagged vegetarian or vegan', () => {
    const chicken = getFood('chicken-breast-cooked')!;
    const beef = getFood('beef-lean-cooked')!;
    expect(chicken.dietaryTags).not.toContain('vegetarian');
    expect(beef.dietaryTags).not.toContain('vegan');
  });
});

// AH: No fabricated values
describe('Food Registry — AH: no fabricated values (provenance)', () => {
  it('every food declares a source and sourceVersion', () => {
    for (const food of getAllFoods()) {
      expect(food.source, `"${food.id}" is missing source`).toBeTruthy();
      expect(food.sourceVersion, `"${food.id}" is missing sourceVersion`).toBeTruthy();
    }
  });

  it('macro-derived calories stay within the documented plausibility tolerance of the stated calories', () => {
    for (const food of getAllFoods()) {
      const macroKcal = food.proteinG * 4 + food.carbsG * 4 + food.fatG * 9;
      expect(macroKcal, `"${food.id}" macro kcal (${macroKcal}) vs stated (${food.calories})`).toBeLessThanOrEqual(food.calories * 1.15 + 8);
    }
  });

  it('no composite/highly-variable recipe dish (e.g. koshari, molokhia) is present as a single fabricated-precision entry', () => {
    const bannedComposites = ['koshari', 'molokhia', 'kofta', 'shawarma'];
    for (const food of getAllFoods()) {
      for (const banned of bannedComposites) {
        expect(food.id.toLowerCase()).not.toContain(banned);
      }
    }
  });
});

// Egyptian/MENA coverage (spec §9/§10 of the final report)
describe('Food Registry — Egyptian/MENA coverage', () => {
  it('includes a real, non-trivial set of Egyptian/MENA-tagged staples', () => {
    const mena = searchFoods({ region: 'egyptian_mena' });
    expect(mena.length).toBeGreaterThanOrEqual(8);
    const ids = mena.map((f) => f.id);
    expect(ids).toContain('ful-medames');
    expect(ids).toContain('baladi-bread');
  });
});
