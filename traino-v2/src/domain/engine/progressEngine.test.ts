import { describe, expect, it } from 'vitest';
import {
  computeExerciseTrend,
  computeNutritionAdherence,
  computePerformanceStats,
  computeRecoveryScore,
  computeWeightTrend,
  computeWorkoutCompletion,
} from './progressEngine';
import type { DayLog } from '../state/LogContext';
import type { ExercisePerformanceLog } from '../progression/types';

function exerciseLog(overrides: Partial<ExercisePerformanceLog> = {}): ExercisePerformanceLog {
  return {
    date: '2026-01-01',
    exerciseName: 'Back Squat',
    prescribedSets: 3,
    completedSets: 3,
    repsAchieved: 8,
    loadKg: 70,
    wasModified: false,
    submittedAt: '2026-01-01T18:00:00.000Z',
    ...overrides,
  };
}

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

describe('computeExerciseTrend — Progress screen data (Y)', () => {
  it('returns null (honest empty state) with no history', () => {
    expect(computeExerciseTrend('Back Squat', [])).toBeNull();
  });

  it('reports "not_enough_data" with only one fully-completed exposure', () => {
    const result = computeExerciseTrend('Back Squat', [exerciseLog()]);
    expect(result?.trend).toBe('not_enough_data');
    expect(result?.previousLabel).toBeNull();
    expect(result?.currentLabel).toContain('70kg');
  });

  it('reports "improving" when load increased between the two most recent full completions', () => {
    const history = [exerciseLog({ date: '2026-01-01', loadKg: 70 }), exerciseLog({ date: '2026-01-08', loadKg: 72.5 })];
    const result = computeExerciseTrend('Back Squat', history);
    expect(result?.trend).toBe('improving');
    expect(result?.previousLabel).toContain('70kg');
    expect(result?.currentLabel).toContain('72.5kg');
  });

  it('reports "declining" when the metric decreased', () => {
    const history = [exerciseLog({ date: '2026-01-01', loadKg: 72.5 }), exerciseLog({ date: '2026-01-08', loadKg: 70 })];
    expect(computeExerciseTrend('Back Squat', history)?.trend).toBe('declining');
  });

  it('never uses a partial/missed exposure as evidence, only fully-completed ones', () => {
    const history = [
      exerciseLog({ date: '2026-01-01', loadKg: 70 }),
      exerciseLog({ date: '2026-01-08', loadKg: 100, completedSets: 1, prescribedSets: 3 }), // partial — must be ignored
    ];
    const result = computeExerciseTrend('Back Squat', history);
    expect(result?.currentLabel).toContain('70kg'); // still the last FULL completion, not the partial 100kg
    expect(result?.trend).toBe('not_enough_data');
  });

  it('falls back through distance/duration/reps metrics for non-load exercises', () => {
    const distance = computeExerciseTrend('Swim Endurance', [
      exerciseLog({ exerciseName: 'Swim Endurance', loadKg: undefined, repsAchieved: undefined, distanceM: 300 }),
    ]);
    expect(distance?.currentLabel).toBe('300m');

    const duration = computeExerciseTrend('Plank Hold', [
      exerciseLog({ exerciseName: 'Plank Hold', loadKg: undefined, repsAchieved: undefined, durationSec: 45 }),
    ]);
    expect(duration?.currentLabel).toBe('45 sec');
  });
});
