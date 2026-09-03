import { describe, expect, it } from 'vitest';
import { buildWeekComparison, type WeekSnapshot } from './weekComparison';
import type { NutritionProgressSummary, ReadinessTrendSummary, TrainingConsistencySummary, WeightTrendSummary } from './types';

const INSUFFICIENT = { state: 'insufficient_data' as const, confidence: 'insufficient' as const, sampleSize: 0 };

function snapshot(overrides: Partial<{ completionPct: number; hasTraining: boolean; calories: number | null; hasNutrition: boolean; readinessScore: number | null; hasReadiness: boolean; deltaKg: number; hasWeight: boolean }> = {}): WeekSnapshot {
  const o = {
    completionPct: 75,
    hasTraining: true,
    calories: 80,
    hasNutrition: true,
    readinessScore: 70,
    hasReadiness: true,
    deltaKg: -0.3,
    hasWeight: true,
    ...overrides,
  };
  const consistency: TrainingConsistencySummary = {
    hasData: o.hasTraining,
    plannedSessions: 4,
    completedSessions: 3,
    adjustedSessions: 0,
    travelAdjustedSessions: 0,
    intentionallySkippedCompetitionSessions: 0,
    completionPct: o.completionPct,
  };
  const nutrition: NutritionProgressSummary = {
    hasDetailedData: o.hasNutrition,
    caloriesAdherencePct: o.calories,
    proteinAdherencePct: o.calories,
    mealCompletionPct: o.completionPct,
    daysWithDetailedLogs: 5,
    trend: INSUFFICIENT,
  };
  const readiness: ReadinessTrendSummary = {
    hasData: o.hasReadiness,
    checkInsCount: 5,
    averageScore: o.readinessScore,
    lowReadinessDaysCount: 0,
    scoreTrend: INSUFFICIENT,
    sleepTrend: INSUFFICIENT,
    energyTrend: INSUFFICIENT,
    sorenessTrend: INSUFFICIENT,
    stressTrend: INSUFFICIENT,
  };
  const weight: WeightTrendSummary = {
    hasData: o.hasWeight,
    points: [80, 79.7],
    deltaKg: o.deltaKg,
    trend: INSUFFICIENT,
    goalAlignment: 'insufficient_data',
  };
  return { consistency, nutrition, readiness, weight };
}

describe('buildWeekComparison', () => {
  it('X: reports real up/down/unchanged directions from real numbers', () => {
    const thisWeek = snapshot({ completionPct: 80, calories: 82, readinessScore: 71, deltaKg: -0.3 });
    const lastWeek = snapshot({ completionPct: 60, calories: 74, readinessScore: 64, deltaKg: -0.1 });
    const result = buildWeekComparison(thisWeek, lastWeek);

    const training = result.metrics.find((m) => m.label === 'Training consistency')!;
    expect(training.thisWeek).toBe(80);
    expect(training.lastWeek).toBe(60);
    expect(training.direction).toBe('up');

    const nutrition = result.metrics.find((m) => m.label === 'Nutrition adherence')!;
    expect(nutrition.direction).toBe('up');

    const readiness = result.metrics.find((m) => m.label === 'Readiness')!;
    expect(readiness.direction).toBe('up');

    const weightRow = result.metrics.find((m) => m.label === 'Weight trend')!;
    expect(weightRow.thisWeek).toBe(-0.3);
    expect(weightRow.lastWeek).toBe(-0.1);
  });

  it('X: missing data on either side reports insufficient_data, never a false "down"', () => {
    const thisWeek = snapshot({ hasNutrition: false, calories: null });
    const lastWeek = snapshot();
    const result = buildWeekComparison(thisWeek, lastWeek);
    const nutrition = result.metrics.find((m) => m.label === 'Nutrition adherence')!;
    expect(nutrition.direction).toBe('insufficient_data');
  });

  it('X: identical values report unchanged', () => {
    const thisWeek = snapshot({ completionPct: 75 });
    const lastWeek = snapshot({ completionPct: 75 });
    const result = buildWeekComparison(thisWeek, lastWeek);
    expect(result.metrics.find((m) => m.label === 'Training consistency')!.direction).toBe('unchanged');
  });

  it('Z: determinism', () => {
    const thisWeek = snapshot();
    const lastWeek = snapshot({ completionPct: 50 });
    const a = buildWeekComparison(thisWeek, lastWeek);
    const b = buildWeekComparison(thisWeek, lastWeek);
    expect(a).toEqual(b);
  });
});
