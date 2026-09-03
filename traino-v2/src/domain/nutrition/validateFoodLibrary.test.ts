import { describe, expect, it } from 'vitest';
import { FoodLibraryValidationError, validateFoodLibrary } from './validateFoodLibrary';
import type { FoodDefinition } from './types';

function makeFood(overrides: Partial<FoodDefinition> = {}): FoodDefinition {
  return {
    id: 'test-food',
    canonicalName: 'Test Food',
    displayName: 'Test Food',
    aliases: [],
    category: 'grain',
    mealRoles: ['carb'],
    servingUnit: 'g',
    servingSize: 100,
    calories: 100,
    proteinG: 2,
    carbsG: 20,
    fatG: 1,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'],
    allergens: [],
    region: 'general',
    budgetTier: 'low',
    source: 'test-source',
    sourceVersion: '1.0',
    ...overrides,
  };
}

describe('validateFoodLibrary — valid input', () => {
  it('accepts a well-formed, minimal library without throwing', () => {
    expect(() => validateFoodLibrary([makeFood()])).not.toThrow();
  });

  it('accepts an empty library', () => {
    expect(() => validateFoodLibrary([])).not.toThrow();
  });
});

describe('validateFoodLibrary — duplicate ids', () => {
  it('rejects two foods sharing the same id', () => {
    const a = makeFood({ id: 'dup' });
    const b = makeFood({ id: 'dup', canonicalName: 'Other' });
    expect(() => validateFoodLibrary([a, b])).toThrow(FoodLibraryValidationError);
  });
});

describe('validateFoodLibrary — empty canonicalName', () => {
  it('rejects a food with an empty canonicalName', () => {
    expect(() => validateFoodLibrary([makeFood({ canonicalName: '' })])).toThrow(FoodLibraryValidationError);
  });
});

describe('validateFoodLibrary — invalid enum values', () => {
  it('rejects an invalid category', () => {
    expect(() => validateFoodLibrary([makeFood({ category: 'not_a_category' as FoodDefinition['category'] })])).toThrow(
      FoodLibraryValidationError
    );
  });

  it('rejects an invalid mealRole', () => {
    expect(() => validateFoodLibrary([makeFood({ mealRoles: ['not_a_role' as FoodDefinition['mealRoles'][number]] })])).toThrow(
      FoodLibraryValidationError
    );
  });

  it('rejects an invalid servingUnit', () => {
    expect(() => validateFoodLibrary([makeFood({ servingUnit: 'lb' as FoodDefinition['servingUnit'] })])).toThrow(FoodLibraryValidationError);
  });

  it('rejects an invalid budgetTier', () => {
    expect(() => validateFoodLibrary([makeFood({ budgetTier: 'luxury' as FoodDefinition['budgetTier'] })])).toThrow(FoodLibraryValidationError);
  });

  it('rejects an empty mealRoles array', () => {
    expect(() => validateFoodLibrary([makeFood({ mealRoles: [] })])).toThrow(FoodLibraryValidationError);
  });

  it('rejects an empty dietaryTags array', () => {
    expect(() => validateFoodLibrary([makeFood({ dietaryTags: [] })])).toThrow(FoodLibraryValidationError);
  });
});

describe('validateFoodLibrary — numeric sanity', () => {
  it('rejects a negative calories value', () => {
    expect(() => validateFoodLibrary([makeFood({ calories: -10 })])).toThrow(FoodLibraryValidationError);
  });

  it('rejects a NaN protein value', () => {
    expect(() => validateFoodLibrary([makeFood({ proteinG: NaN })])).toThrow(FoodLibraryValidationError);
  });

  it('rejects an Infinity fat value', () => {
    expect(() => validateFoodLibrary([makeFood({ fatG: Infinity })])).toThrow(FoodLibraryValidationError);
  });

  it('rejects a servingSize of 0', () => {
    expect(() => validateFoodLibrary([makeFood({ servingSize: 0 })])).toThrow(FoodLibraryValidationError);
  });

  it('rejects macro calories that wildly exceed the stated calories (impossible total)', () => {
    expect(() => validateFoodLibrary([makeFood({ calories: 10, proteinG: 50, carbsG: 50, fatG: 50 })])).toThrow(FoodLibraryValidationError);
  });
});

describe('validateFoodLibrary — allergen references', () => {
  it('rejects an unknown allergen id', () => {
    expect(() => validateFoodLibrary([makeFood({ allergens: ['not_a_real_allergen'] })])).toThrow(FoodLibraryValidationError);
  });

  it('accepts a real, registered allergen id', () => {
    expect(() => validateFoodLibrary([makeFood({ allergens: ['dairy'] })])).not.toThrow();
  });
});

describe('validateFoodLibrary — provenance', () => {
  it('rejects a food missing source/sourceVersion', () => {
    expect(() => validateFoodLibrary([makeFood({ source: '' })])).toThrow(FoodLibraryValidationError);
    expect(() => validateFoodLibrary([makeFood({ sourceVersion: '' })])).toThrow(FoodLibraryValidationError);
  });
});

describe('validateFoodLibrary — ambiguous name/alias collisions', () => {
  it('rejects two different foods whose canonicalName collides case-insensitively', () => {
    const a = makeFood({ id: 'a', canonicalName: 'Bread' });
    const b = makeFood({ id: 'b', canonicalName: 'bread' });
    expect(() => validateFoodLibrary([a, b])).toThrow(FoodLibraryValidationError);
  });

  it("rejects an alias that collides with a different food's canonicalName", () => {
    const a = makeFood({ id: 'a', canonicalName: 'Bread' });
    const b = makeFood({ id: 'b', canonicalName: 'Toast', aliases: ['Bread'] });
    expect(() => validateFoodLibrary([a, b])).toThrow(FoodLibraryValidationError);
  });
});

describe('validateFoodLibrary — accumulates all errors', () => {
  it('reports more than one violation when multiple exist', () => {
    const a = makeFood({ id: 'dup', canonicalName: '' });
    const b = makeFood({ id: 'dup', calories: -5 });
    try {
      validateFoodLibrary([a, b]);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(FoodLibraryValidationError);
      const lines = (e as Error).message.split('\n').filter((l) => l.startsWith('- '));
      expect(lines.length).toBeGreaterThan(1);
    }
  });
});
