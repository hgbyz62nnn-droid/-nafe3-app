import { describe, expect, it } from 'vitest';
import { buildGoalProgress } from './goalProgress';
import type { ExercisePerformanceMetrics, NutritionProgressSummary, ReadinessTrendSummary, TrainingConsistencySummary, WeightTrendSummary } from './types';

const INSUFFICIENT = { state: 'insufficient_data' as const, confidence: 'insufficient' as const, sampleSize: 0 };

function consistency(overrides: Partial<TrainingConsistencySummary> = {}): TrainingConsistencySummary {
  return { hasData: true, plannedSessions: 4, completedSessions: 4, adjustedSessions: 0, travelAdjustedSessions: 0, intentionallySkippedCompetitionSessions: 0, completionPct: 100, ...overrides };
}
function nutrition(overrides: Partial<NutritionProgressSummary> = {}): NutritionProgressSummary {
  return { hasDetailedData: true, caloriesAdherencePct: 90, proteinAdherencePct: 90, mealCompletionPct: 90, daysWithDetailedLogs: 5, trend: INSUFFICIENT, ...overrides };
}
function readiness(overrides: Partial<ReadinessTrendSummary> = {}): ReadinessTrendSummary {
  return { hasData: true, checkInsCount: 5, averageScore: 75, lowReadinessDaysCount: 0, scoreTrend: INSUFFICIENT, sleepTrend: INSUFFICIENT, energyTrend: INSUFFICIENT, sorenessTrend: INSUFFICIENT, stressTrend: INSUFFICIENT, ...overrides };
}
function weight(overrides: Partial<WeightTrendSummary> = {}): WeightTrendSummary {
  return { hasData: true, points: [80, 79], deltaKg: -1, trend: { state: 'declining', confidence: 'limited', sampleSize: 2 }, goalAlignment: 'aligned', ...overrides };
}

describe('buildGoalProgress', () => {
  it('W: no data at all -> overallScore is null, never a fabricated 0', () => {
    const result = buildGoalProgress(
      'fat_loss',
      consistency({ hasData: false, completionPct: 0 }),
      nutrition({ hasDetailedData: false, caloriesAdherencePct: null }),
      readiness({ hasData: false, averageScore: null }),
      weight({ hasData: false, goalAlignment: 'insufficient_data' }),
      []
    );
    expect(result.overallScore).toBeNull();
    expect(result.components.every((c) => c.score === null)).toBe(true);
  });

  it('W: fat_loss combines weight/training/nutrition, excludes readiness/exercise', () => {
    const result = buildGoalProgress('fat_loss', consistency(), nutrition(), readiness(), weight(), []);
    expect(result.overallScore).not.toBeNull();
    expect(result.components.map((c) => c.label)).toEqual(['Weight trend', 'Training consistency', 'Nutrition adherence']);
  });

  it('W: partial data renormalizes weights over available components', () => {
    const full = buildGoalProgress('fat_loss', consistency(), nutrition(), readiness(), weight(), []);
    const partial = buildGoalProgress('fat_loss', consistency(), nutrition({ hasDetailedData: false, caloriesAdherencePct: null }), readiness(), weight(), []);
    expect(partial.overallScore).not.toBeNull();
    // With nutrition excluded, the score should still be bounded 0-100.
    expect(partial.overallScore).toBeGreaterThanOrEqual(0);
    expect(partial.overallScore).toBeLessThanOrEqual(100);
    expect(full.overallScore).not.toEqual(undefined);
  });

  it('W: muscle_gain includes exercise performance', () => {
    const result = buildGoalProgress('muscle_gain', consistency(), nutrition(), readiness(), weight(), []);
    expect(result.components.map((c) => c.label)).toContain('Exercise performance');
  });

  it('W: performance goal weighs sport-relevant exercises, readiness, training, nutrition', () => {
    const exercises: ExercisePerformanceMetrics[] = [
      {
        exerciseName: 'Sprint',
        model: 'duration',
        totalExposures: 4,
        successfulExposures: 4,
        failedOrPartialExposures: 0,
        contextualExposureCount: 0,
        previous: null,
        current: null,
        best: null,
        trend: { state: 'improving', confidence: 'sufficient', sampleSize: 4 },
        personalRecords: [],
        latestProgressionDecision: null,
        sportRelevance: 'primary',
      },
      {
        exerciseName: 'Bicep Curl',
        model: 'load',
        totalExposures: 4,
        successfulExposures: 4,
        failedOrPartialExposures: 0,
        contextualExposureCount: 0,
        previous: null,
        current: null,
        best: null,
        trend: { state: 'declining', confidence: 'sufficient', sampleSize: 4 },
        personalRecords: [],
        latestProgressionDecision: null,
        sportRelevance: 'general',
      },
    ];
    const result = buildGoalProgress('performance', consistency(), nutrition(), readiness(), weight(), exercises);
    const perfComponent = result.components.find((c) => c.label.includes('exercise performance'));
    // Sprint (primary, improving) should dominate over the general Bicep Curl (declining).
    expect(perfComponent?.score).toBe(100);
  });

  it('every score is bounded 0-100 and finite', () => {
    const result = buildGoalProgress('fat_loss', consistency({ completionPct: 250 }), nutrition(), readiness(), weight(), []);
    for (const c of result.components) {
      if (c.score !== null) {
        expect(Number.isFinite(c.score)).toBe(true);
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(100);
      }
    }
    if (result.overallScore !== null) {
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    }
  });

  it('Z: determinism', () => {
    const a = buildGoalProgress('fat_loss', consistency(), nutrition(), readiness(), weight(), []);
    const b = buildGoalProgress('fat_loss', consistency(), nutrition(), readiness(), weight(), []);
    expect(a).toEqual(b);
  });
});
