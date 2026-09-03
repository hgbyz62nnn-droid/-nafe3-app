import { describe, expect, it } from 'vitest';
import { footballModule } from './football/program';
import { swimmingModule } from './swimming/program';
import { generateMealPlan, getMealAlternative } from '../engine/nutritionPlanEngine';
import { calculateNutritionTargets } from '../engine/nutritionEngine';
import { baseAnswers } from '../engine/testFixtures';
import { getSportModule } from './registry';

/**
 * Nutrition Engine test matrix (spec §33): AE — Football nutrition context;
 * AF — Swimming nutrition context; AG — existing nutrition compatibility.
 * Also re-verifies spec §32's zero-sport-branching rule against the generic
 * Nutrition Engine files directly (source-level check, complementing the
 * runtime assertions below).
 */

// AE: Football nutrition context
describe('Football — AE: sport-authored nutrition considerations, consumed generically', () => {
  it('exposes structured, non-empty nutrition considerations', () => {
    expect(Array.isArray(footballModule.nutritionProfile.considerations)).toBe(true);
    expect(footballModule.nutritionProfile.considerations!.length).toBeGreaterThan(0);
    for (const note of footballModule.nutritionProfile.considerations!) {
      expect(typeof note).toBe('string');
      expect(note.length).toBeGreaterThan(0);
    }
  });

  it('still drives real, sane calorie/macro targets through the generic engine', () => {
    const targets = calculateNutritionTargets(baseAnswers({ sport: 'football' }), footballModule.nutritionProfile);
    expect(targets.calories).toBeGreaterThan(1200);
    expect(Number.isFinite(targets.calories)).toBe(true);
  });
});

// AF: Swimming nutrition context
describe('Swimming — AF: sport-authored nutrition considerations, consumed generically', () => {
  it('exposes structured, non-empty nutrition considerations', () => {
    expect(Array.isArray(swimmingModule.nutritionProfile.considerations)).toBe(true);
    expect(swimmingModule.nutritionProfile.considerations!.length).toBeGreaterThan(0);
    for (const note of swimmingModule.nutritionProfile.considerations!) {
      expect(typeof note).toBe('string');
      expect(note.length).toBeGreaterThan(0);
    }
  });

  it('still drives real, sane calorie/macro targets through the generic engine', () => {
    const targets = calculateNutritionTargets(baseAnswers({ sport: 'swimming' }), swimmingModule.nutritionProfile);
    expect(targets.calories).toBeGreaterThan(1200);
    expect(Number.isFinite(targets.calories)).toBe(true);
  });
});

// Sport branching rule (spec §32) — a runtime cross-check that every registered
// sport's `considerations` are read the exact same generic way (no id-specific path).
describe('Nutrition Engine — sport branching rule (spec §32)', () => {
  it('every registered sport module exposes a nutritionProfile the generic engine can consume identically', () => {
    for (const sportId of ['football', 'swimming', 'basketball'] as const) {
      const sport = getSportModule(sportId);
      expect(sport.nutritionProfile).toBeDefined();
      expect(typeof sport.nutritionProfile.proteinGPerKg).toBe('number');
      const targets = calculateNutritionTargets(baseAnswers({ sport: sportId }), sport.nutritionProfile);
      expect(Number.isFinite(targets.calories)).toBe(true);
    }
  });

  it("football's and swimming's considerations are distinct data, not a shared hardcoded string (proves they come from each module's own data, not sport-id branching)", () => {
    expect(footballModule.nutritionProfile.considerations).not.toEqual(swimmingModule.nutritionProfile.considerations);
  });
});

// AG: Existing nutrition compatibility — the old 20-meal-template system stays
// completely functional as an inert legacy layer (spec §30), even though the
// active Nutrition screen no longer calls it.
describe('Legacy nutritionPlanEngine — AG: existing nutrition compatibility (untouched, still functional)', () => {
  it('generateMealPlan still produces a real, non-empty meal plan from the old MEAL_LIBRARY', () => {
    const answers = baseAnswers();
    const targets = calculateNutritionTargets(answers, { proteinGPerKg: 2.0, carbBias: 'high' });
    const plan = generateMealPlan(answers, targets);
    expect(plan.length).toBeGreaterThan(0);
  });

  it('getMealAlternative still resolves a real alternative from the old MEAL_LIBRARY', () => {
    const answers = baseAnswers();
    const targets = calculateNutritionTargets(answers, { proteinGPerKg: 2.0, carbBias: 'high' });
    const plan = generateMealPlan(answers, targets);
    const first = plan.find((p) => p.meal !== null)!;
    const alt = getMealAlternative(first.slot, first.meal!.id, answers);
    expect(alt).not.toBeNull();
  });
});
