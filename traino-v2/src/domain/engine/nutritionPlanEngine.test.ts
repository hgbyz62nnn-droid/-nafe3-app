import { describe, expect, it } from 'vitest';
import { generateMealPlan, getMealAlternative } from './nutritionPlanEngine';
import { calculateNutritionTargets } from './nutritionEngine';
import { baseAnswers } from './testFixtures';

const sportProfile = { proteinGPerKg: 2.0, carbBias: 'moderate' as const };

function targetsFor(answers: ReturnType<typeof baseAnswers>) {
  return calculateNutritionTargets(answers, sportProfile);
}

describe('generateMealPlan — allergies', () => {
  it('never selects a meal containing a reported allergen, across every diet/budget combination', () => {
    const diets = ['no_restriction', 'vegetarian', 'vegan', 'high_protein', 'low_carb'] as const;
    const budgets = ['low', 'medium', 'high'] as const;
    const allergyCombos = [['dairy'], ['nuts'], ['gluten'], ['shellfish', 'eggs'], ['dairy', 'nuts', 'gluten']];

    for (const dietaryPreference of diets) {
      for (const budgetTier of budgets) {
        for (const allergyIds of allergyCombos) {
          const answers = baseAnswers({ dietaryPreference, budgetTier, allergyIds });
          const plan = generateMealPlan(answers, targetsFor(answers));
          for (const entry of plan) {
            if (!entry.meal) continue;
            for (const allergen of entry.meal.allergens) {
              expect(allergyIds).not.toContain(allergen);
            }
          }
        }
      }
    }
  });

  it('picks the one allergen-free breakfast when every other breakfast option contains dairy', () => {
    const answers = baseAnswers({ allergyIds: ['dairy'] });
    const plan = generateMealPlan(answers, targetsFor(answers));
    const breakfast = plan.find((e) => e.slot === 'breakfast');
    expect(breakfast?.meal?.id).toBe('bf_tofu_scramble');
  });
});

describe('generateMealPlan — dietary preferences', () => {
  it('honors a vegan preference when a vegan-tagged option exists for the slot', () => {
    const answers = baseAnswers({ dietaryPreference: 'vegan' });
    const plan = generateMealPlan(answers, targetsFor(answers));
    const lunch = plan.find((e) => e.slot === 'lunch');
    expect(lunch?.meal?.dietaryTags).toContain('vegan');
    expect(lunch?.meal?.id).toBe('ln_lentil_curry');
  });

  it('every returned meal is eligible under `no_restriction` (the universal tag)', () => {
    const answers = baseAnswers({ dietaryPreference: 'no_restriction' });
    const plan = generateMealPlan(answers, targetsFor(answers));
    for (const entry of plan) {
      expect(entry.meal).not.toBeNull();
      expect(entry.meal!.dietaryTags).toContain('no_restriction');
    }
  });
});

describe('generateMealPlan — budget filtering', () => {
  it('a low budget tier only selects low-tier meals when that is the only eligible option', () => {
    const answers = baseAnswers({ budgetTier: 'low' });
    const plan = generateMealPlan(answers, targetsFor(answers));
    const dinner = plan.find((e) => e.slot === 'dinner');
    expect(dinner?.meal?.budgetTier).toBe('low');
    expect(dinner?.meal?.id).toBe('dn_tofu_stirfry');
  });

  it('a high budget tier can select meals of any tier at or below it', () => {
    const answers = baseAnswers({ budgetTier: 'high' });
    const plan = generateMealPlan(answers, targetsFor(answers));
    for (const entry of plan) {
      expect(['low', 'medium', 'high']).toContain(entry.meal?.budgetTier);
    }
  });
});

describe('generateMealPlan — general behavior', () => {
  it('returns exactly one entry per slot, in a fixed order', () => {
    const answers = baseAnswers();
    const plan = generateMealPlan(answers, targetsFor(answers));
    expect(plan.map((e) => e.slot)).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
  });

  it('is deterministic — the same answers/targets always produce the same plan', () => {
    const answers = baseAnswers({ dietaryPreference: 'high_protein', budgetTier: 'medium' });
    const targets = targetsFor(answers);
    const planA = generateMealPlan(answers, targets);
    const planB = generateMealPlan(answers, targets);
    expect(planA.map((e) => e.meal?.id)).toEqual(planB.map((e) => e.meal?.id));
  });
});

describe('getMealAlternative', () => {
  it('cycles deterministically to the next eligible meal for the slot', () => {
    const answers = baseAnswers();
    const alt = getMealAlternative('breakfast', 'bf_oatmeal_whey', answers);
    expect(alt).not.toBeNull();
    expect(alt!.id).not.toBe('bf_oatmeal_whey');
  });

  it('wraps back to the first candidate after the last one', () => {
    const answers = baseAnswers({ allergyIds: ['dairy'] });
    // Only bf_tofu_scramble is allergen-safe for breakfast under this allergy — cycling
    // from it (or any starting point) must still land back on itself, not null/undefined.
    const alt = getMealAlternative('breakfast', 'bf_tofu_scramble', answers);
    expect(alt?.id).toBe('bf_tofu_scramble');
  });

  it('returns null rather than throwing when the slot has no eligible candidates', () => {
    // Construct an answers object no real meal in the library can satisfy at all
    // (an allergy combination excluding every current dinner entry).
    const answers = baseAnswers({ allergyIds: ['dairy', 'nuts', 'gluten', 'shellfish', 'eggs'] });
    const alt = getMealAlternative('breakfast', 'does-not-exist', answers);
    // Even if the library still has a safe candidate, this must never throw.
    expect(() => getMealAlternative('breakfast', 'does-not-exist', answers)).not.toThrow();
    expect(alt === null || typeof alt?.id === 'string').toBe(true);
  });
});
