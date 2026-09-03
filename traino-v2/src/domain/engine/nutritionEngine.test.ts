import { describe, expect, it } from 'vitest';
import { calculateNutritionTargets } from './nutritionEngine';
import { baseAnswers } from './testFixtures';

const sportProfile = { proteinGPerKg: 2.0, carbBias: 'high' as const };

describe('calculateNutritionTargets — calorie calculation', () => {
  it('produces a sane calorie target for a typical adult male', () => {
    const targets = calculateNutritionTargets(baseAnswers({ weightKg: 80, heightCm: 180, age: 28, sex: 'male' }), sportProfile);
    expect(targets.calories).toBeGreaterThan(1800);
    expect(targets.calories).toBeLessThan(4000);
  });

  it('lowers the target for a fat_loss goal relative to general_fitness', () => {
    const maintenance = calculateNutritionTargets(baseAnswers({ goal: 'general_fitness' }), sportProfile);
    const cut = calculateNutritionTargets(baseAnswers({ goal: 'fat_loss' }), sportProfile);
    expect(cut.calories).toBeLessThan(maintenance.calories);
  });

  it('raises the target for a muscle_gain goal relative to general_fitness', () => {
    const maintenance = calculateNutritionTargets(baseAnswers({ goal: 'general_fitness' }), sportProfile);
    const bulk = calculateNutritionTargets(baseAnswers({ goal: 'muscle_gain' }), sportProfile);
    expect(bulk.calories).toBeGreaterThan(maintenance.calories);
  });

  it('regression: never returns a calorie target below the safety floor, even for pre-assessment placeholder stats', () => {
    // The exact bug found in review: all-zero/placeholder body stats feeding the
    // linear BMR formula directly produced NaN or negative calorie targets.
    const targets = calculateNutritionTargets(
      baseAnswers({ age: 25, heightCm: 170, weightKg: 70, sex: 'female', goal: 'fat_loss', daysAvailablePerWeek: 0 }),
      sportProfile
    );
    expect(targets.calories).toBeGreaterThanOrEqual(1200);
    expect(Number.isFinite(targets.calories)).toBe(true);
    expect(Number.isNaN(targets.calories)).toBe(false);
  });

  it('regression: an unrecognized goal enum value falls back to a neutral multiplier instead of NaN', () => {
    const answers = baseAnswers({ goal: 'general_fitness' });
    // Simulate corrupted persisted data reaching the engine directly (bypassing the
    // AssessmentAnswers type at the JS/runtime boundary, as real corrupt localStorage would).
    const corrupted = { ...answers, goal: 'not_a_real_goal' as never };
    const targets = calculateNutritionTargets(corrupted, sportProfile);
    expect(Number.isNaN(targets.calories)).toBe(false);
    expect(targets.calories).toBeGreaterThanOrEqual(1200);
  });
});

describe('calculateNutritionTargets — macro calculation', () => {
  it('scales protein target directly with bodyweight and the sport profile ratio', () => {
    const lighter = calculateNutritionTargets(baseAnswers({ weightKg: 60 }), sportProfile);
    const heavier = calculateNutritionTargets(baseAnswers({ weightKg: 100 }), sportProfile);
    expect(heavier.proteinG).toBeGreaterThan(lighter.proteinG);
    expect(lighter.proteinG).toBe(Math.round(60 * sportProfile.proteinGPerKg));
  });

  it('all macros are non-negative finite numbers', () => {
    const targets = calculateNutritionTargets(baseAnswers(), sportProfile);
    for (const value of [targets.calories, targets.proteinG, targets.carbsG, targets.fatG]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('a high carb-bias sport allocates less to fat than a low carb-bias sport, calories held equal', () => {
    const highCarb = calculateNutritionTargets(baseAnswers(), { proteinGPerKg: 2.0, carbBias: 'high' });
    const lowCarb = calculateNutritionTargets(baseAnswers(), { proteinGPerKg: 2.0, carbBias: 'low' });
    expect(highCarb.fatG).toBeLessThan(lowCarb.fatG);
  });
});
