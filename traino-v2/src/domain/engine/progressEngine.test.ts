import { describe, expect, it } from 'vitest';
import {
  computeNutritionAdherence,
  computePerformanceStats,
  computeRecoveryScore,
  computeWeightTrend,
  computeWorkoutCompletion,
} from './progressEngine';
import type { DayLog } from '../state/LogContext';

function log(overrides: Partial<DayLog> = {}): DayLog {
  return {
    date: '2026-01-01',
    loggedMealSlots: [],
    mealOverrides: {},
    workoutCompleted: false,
    ...overrides,
  };
}

describe('computeWorkoutCompletion — progress calculations', () => {
  it('counts only completed workouts against the window size', () => {
    const logs = [log({ workoutCompleted: true }), log({ workoutCompleted: false }), log({ workoutCompleted: true })];
    expect(computeWorkoutCompletion(logs)).toEqual({ completed: 2, planned: 3 });
  });

  it('an empty history reports honestly as zero, not fabricated', () => {
    expect(computeWorkoutCompletion([])).toEqual({ completed: 0, planned: 0 });
  });
});

describe('computeNutritionAdherence', () => {
  it('is 0% with no logged meals', () => {
    expect(computeNutritionAdherence([log(), log()])).toBe(0);
  });

  it('is 100% when every meal slot was logged every day', () => {
    const logs = [log({ loggedMealSlots: ['breakfast', 'lunch', 'snack', 'dinner'] })];
    expect(computeNutritionAdherence(logs)).toBe(100);
  });

  it('returns 0 for an empty window instead of dividing by zero', () => {
    expect(computeNutritionAdherence([])).toBe(0);
    expect(Number.isNaN(computeNutritionAdherence([]))).toBe(false);
  });
});

describe('computeRecoveryScore', () => {
  it('stays within the defined 40-95 band regardless of input extremes', () => {
    const overtrained = Array.from({ length: 14 }, () => log({ workoutCompleted: true }));
    const undertrained = Array.from({ length: 14 }, () => log({ workoutCompleted: false }));
    const overScore = computeRecoveryScore(overtrained, 2);
    const underScore = computeRecoveryScore(undertrained, 5);
    expect(overScore).toBeGreaterThanOrEqual(40);
    expect(overScore).toBeLessThanOrEqual(95);
    expect(underScore).toBeGreaterThanOrEqual(40);
    expect(underScore).toBeLessThanOrEqual(95);
  });

  it('regression: never NaN when plannedDaysPerWeek is 0', () => {
    const score = computeRecoveryScore([log()], 0);
    expect(Number.isNaN(score)).toBe(false);
  });
});

describe('computeWeightTrend', () => {
  it('falls back to the profile weight, honestly flagged as no data, when nothing was logged', () => {
    const trend = computeWeightTrend([log(), log()], 82);
    expect(trend.hasData).toBe(false);
    expect(trend.points).toEqual([82, 82]);
    expect(trend.deltaKg).toBe(0);
  });

  it('computes delta between the first and last logged weigh-ins', () => {
    const logs = [log({ date: '2026-01-01', weightKg: 80 }), log({ date: '2026-01-08', weightKg: 78.5 })];
    const trend = computeWeightTrend(logs, 999);
    expect(trend.hasData).toBe(true);
    expect(trend.deltaKg).toBe(-1.5);
  });
});

describe('computePerformanceStats', () => {
  it('reports hasData:false for a category with no completed workouts', () => {
    const stats = computePerformanceStats([]);
    expect(stats.speed.hasData).toBe(false);
    expect(stats.strength.hasData).toBe(false);
    expect(stats.stamina.hasData).toBe(false);
  });

  it('buckets by the log\'s stored statCategory, not a guess from the workout name', () => {
    // Regression: the old implementation guessed a category from keywords in the
    // workout's name; a modern log always carries statCategory explicitly and must
    // be bucketed by that field even if the name would suggest a different category.
    const logs = [log({ workoutCompleted: true, workoutName: 'Speed Session', statCategory: 'strength' })];
    const stats = computePerformanceStats(logs);
    expect(stats.strength.hasData).toBe(true);
    expect(stats.speed.hasData).toBe(false);
  });

  it('falls back to name-based guessing only for legacy logs with no stored statCategory', () => {
    const logs = [log({ workoutCompleted: true, workoutName: 'Speed + Lower Body' })];
    const stats = computePerformanceStats(logs);
    expect(stats.speed.hasData).toBe(true);
  });
});
