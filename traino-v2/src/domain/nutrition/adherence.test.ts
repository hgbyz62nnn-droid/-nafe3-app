import { describe, expect, it } from 'vitest';
import { computeDetailedNutritionAdherence, recommendNutritionTargetReview } from './adherence';
import type { DayLog } from '../state/LogContext';
import type { NutritionLogEntry } from './types';

/**
 * Nutrition Engine test matrix (spec §33): AA — nutrition adherence;
 * AC — weight trend behavior.
 */

function nutritionLog(overrides: Partial<NutritionLogEntry> = {}): NutritionLogEntry {
  return {
    date: '2026-02-01',
    slotId: 'breakfast',
    foodId: 'white-rice-cooked',
    quantity: 1,
    calories: 500,
    proteinG: 30,
    carbsG: 60,
    fatG: 10,
    wasModified: false,
    submittedAt: '2026-02-01T08:00:00.000Z',
    ...overrides,
  };
}

function dayLog(overrides: Partial<DayLog> = {}): DayLog {
  return {
    date: '2026-02-01',
    loggedMealSlots: [],
    mealOverrides: {},
    workoutCompleted: false,
    ...overrides,
  };
}

const TARGETS = { calories: 2000, proteinG: 150 };

describe('computeDetailedNutritionAdherence — AA: nutrition adherence', () => {
  it('is incomplete (never presented as 0%) when fewer than the minimum days have detailed logs', () => {
    const logs = [dayLog({ date: '2026-02-01', nutritionLogs: [nutritionLog()] })];
    const result = computeDetailedNutritionAdherence(logs, TARGETS);
    expect(result.isIncomplete).toBe(true);
    expect(result.caloriesAdherencePct).toBeNull();
    expect(result.proteinAdherencePct).toBeNull();
  });

  it('a day with no nutritionLogs is excluded from the average, never counted as 0%', () => {
    const logs = [
      dayLog({ date: '2026-02-01', nutritionLogs: [nutritionLog({ calories: 2000, proteinG: 150 })] }),
      dayLog({ date: '2026-02-02', nutritionLogs: [nutritionLog({ calories: 2000, proteinG: 150 })] }),
      dayLog({ date: '2026-02-03' }), // no logging this day at all
    ];
    const result = computeDetailedNutritionAdherence(logs, TARGETS);
    expect(result.isIncomplete).toBe(false);
    expect(result.daysWithDetailedLogs).toBe(2);
    expect(result.caloriesAdherencePct).toBe(100);
  });

  it('computes real average calorie/protein adherence across detailed-logged days', () => {
    const logs = [
      dayLog({ date: '2026-02-01', nutritionLogs: [nutritionLog({ calories: 1000, proteinG: 75 })] }),
      dayLog({ date: '2026-02-02', nutritionLogs: [nutritionLog({ calories: 2000, proteinG: 150 })] }),
    ];
    const result = computeDetailedNutritionAdherence(logs, TARGETS);
    expect(result.caloriesAdherencePct).toBe(75);
    expect(result.proteinAdherencePct).toBe(75);
  });

  it('sums multiple logged foods within the same day before computing the ratio', () => {
    const logs = [
      dayLog({
        date: '2026-02-01',
        nutritionLogs: [nutritionLog({ foodId: 'a', calories: 1000, proteinG: 75 }), nutritionLog({ foodId: 'b', calories: 1000, proteinG: 75 })],
      }),
      dayLog({ date: '2026-02-02', nutritionLogs: [nutritionLog({ calories: 2000, proteinG: 150 })] }),
    ];
    const result = computeDetailedNutritionAdherence(logs, TARGETS);
    expect(result.caloriesAdherencePct).toBe(100);
  });

  it('caps adherence at 100% rather than reporting over-target days as more than fully adherent', () => {
    const logs = [
      dayLog({ date: '2026-02-01', nutritionLogs: [nutritionLog({ calories: 5000, proteinG: 400 })] }),
      dayLog({ date: '2026-02-02', nutritionLogs: [nutritionLog({ calories: 5000, proteinG: 400 })] }),
    ];
    const result = computeDetailedNutritionAdherence(logs, TARGETS);
    expect(result.caloriesAdherencePct).toBe(100);
    expect(result.proteinAdherencePct).toBe(100);
  });

  it('never produces NaN or negative percentages for any input', () => {
    const logs = [
      dayLog({ date: '2026-02-01', nutritionLogs: [nutritionLog({ calories: 0, proteinG: 0 })] }),
      dayLog({ date: '2026-02-02', nutritionLogs: [nutritionLog({ calories: 0, proteinG: 0 })] }),
    ];
    const result = computeDetailedNutritionAdherence(logs, TARGETS);
    expect(Number.isNaN(result.caloriesAdherencePct)).toBe(false);
    expect(result.caloriesAdherencePct).toBeGreaterThanOrEqual(0);
  });

  it('mealCompletionPct is always computable, independent of detailed-logging completeness', () => {
    const logs = [dayLog({ date: '2026-02-01', loggedMealSlots: ['breakfast', 'lunch'] })];
    const result = computeDetailedNutritionAdherence(logs, TARGETS);
    expect(result.mealCompletionPct).toBe(50);
  });
});

describe('recommendNutritionTargetReview — AC: weight trend behavior', () => {
  it('returns null when there is no real weight history (never invents a recommendation)', () => {
    const result = recommendNutritionTargetReview('fat_loss', { points: [80, 80], hasData: false, deltaKg: 0 });
    expect(result).toBeNull();
  });

  it('does not fire for a small, noisy weight fluctuation under the divergence threshold', () => {
    const result = recommendNutritionTargetReview('fat_loss', { points: [80, 80.2], hasData: true, deltaKg: 0.2 });
    expect(result).toBeNull();
  });

  it('recommends a review for fat_loss when the real multi-day trend consistently moves up', () => {
    const result = recommendNutritionTargetReview('fat_loss', { points: [80, 81], hasData: true, deltaKg: 1 });
    expect(result?.shouldReview).toBe(true);
    expect(result?.reason).toMatch(/fat-loss goal/i);
  });

  it('recommends a review for muscle_gain when the real multi-day trend consistently moves down', () => {
    const result = recommendNutritionTargetReview('muscle_gain', { points: [80, 79], hasData: true, deltaKg: -1 });
    expect(result?.shouldReview).toBe(true);
    expect(result?.reason).toMatch(/muscle-gain goal/i);
  });

  it('does not fire when the trend moves in the direction that supports the goal', () => {
    const fatLoss = recommendNutritionTargetReview('fat_loss', { points: [80, 79], hasData: true, deltaKg: -1 });
    const muscleGain = recommendNutritionTargetReview('muscle_gain', { points: [80, 81], hasData: true, deltaKg: 1 });
    expect(fatLoss).toBeNull();
    expect(muscleGain).toBeNull();
  });

  it('never fires for maintenance/performance goals regardless of trend direction', () => {
    const maintenance = recommendNutritionTargetReview('general_fitness', { points: [80, 82], hasData: true, deltaKg: 2 });
    const performance = recommendNutritionTargetReview('performance', { points: [80, 78], hasData: true, deltaKg: -2 });
    expect(maintenance).toBeNull();
    expect(performance).toBeNull();
  });

  it('never automatically changes calories — the function only returns a boolean recommendation and explanatory text', () => {
    const result = recommendNutritionTargetReview('fat_loss', { points: [80, 81], hasData: true, deltaKg: 1 });
    expect(result).not.toHaveProperty('newCalorieTarget');
    expect(typeof result?.reason).toBe('string');
  });
});
