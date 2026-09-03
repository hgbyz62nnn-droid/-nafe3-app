import { describe, expect, it } from 'vitest';
import { buildPerformanceSummary, type BuildPerformanceSummaryInput } from './performanceEngine';
import type { DayLog } from '../state/LogContext';
import type { DailyReadinessRecord, DailyReadinessInputs } from '../readiness/types';
import type { ExercisePerformanceLog } from '../progression/types';

function day(date: string, overrides: Partial<DayLog> = {}): DayLog {
  return { date, loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false, ...overrides };
}

function readinessRecord(date: string, score: number): DailyReadinessRecord {
  const inputs: DailyReadinessInputs = { sleepQuality: 3, sleepDurationBucket: 3, energy: 3, stress: 3, soreness: 3, motivation: 3, painFlag: false };
  return { date, inputs, score, status: 'normal', recommendation: { message: 'ok', adjustmentApplied: false }, recommendationApplied: false, submittedAt: `${date}T08:00:00.000Z` };
}

function baseInput(overrides: Partial<BuildPerformanceSummaryInput> = {}): BuildPerformanceSummaryInput {
  const recentLogs30 = Array.from({ length: 30 }, (_, i) => day(`2026-01-${String(i + 1).padStart(2, '0')}`));
  return {
    today: '2026-01-30',
    goal: 'general_fitness',
    sportId: 'football',
    plannedPerWeek: 4,
    weightFallbackKg: 80,
    nutritionTargets: { calories: 2500, proteinG: 160 },
    exerciseNames: [],
    getExerciseHistory: () => [],
    recentLogs30,
    readinessRecords30: [],
    travelContexts: [],
    competitionEvents: [],
    ...overrides,
  };
}

describe('buildPerformanceSummary', () => {
  it('A: an athlete with zero history produces a fully honest, non-crashing empty summary', () => {
    const summary = buildPerformanceSummary(baseInput());
    expect(summary.exercises).toEqual([]);
    // Training consistency IS real data even with zero completed sessions —
    // the athlete's planned cadence (4/week) makes "0 of 4 completed" an
    // honest, real answer, never suppressed as "no data".
    expect(summary.trainingConsistency.hasData).toBe(true);
    expect(summary.trainingConsistency.completedSessions).toBe(0);
    expect(summary.nutrition.hasDetailedData).toBe(false);
    expect(summary.readiness.hasData).toBe(false);
    expect(summary.weight.hasData).toBe(false);
    // general_fitness's only always-available component here is training
    // consistency, which is real (0%) — so a real, honest, non-null score.
    expect(summary.goalProgress.overallScore).toBe(0);
    expect(summary.milestones).toEqual([]);
  });

  it('exercise history is threaded through into the exercises array', () => {
    const history: ExercisePerformanceLog[] = [
      {
        date: '2026-01-01',
        exerciseName: 'Back Squat',
        prescribedSets: 3,
        completedSets: 3,
        loadKg: 60,
        repsAchieved: 8,
        wasModified: false,
        submittedAt: '2026-01-01T12:00:00.000Z',
      },
    ];
    const summary = buildPerformanceSummary(
      baseInput({
        exerciseNames: ['Back Squat'],
        getExerciseHistory: (name) => (name === 'Back Squat' ? history : []),
      })
    );
    expect(summary.exercises).toHaveLength(1);
    expect(summary.exercises[0].exerciseName).toBe('Back Squat');
    expect(summary.exercises[0].current?.value).toBe(60);
  });

  it('readiness/nutrition/weight data flows through into the summary', () => {
    const recentLogs30 = Array.from({ length: 30 }, (_, i) => day(`2026-01-${String(i + 1).padStart(2, '0')}`, { weightKg: 80 - i * 0.1 }));
    const readinessRecords30 = Array.from({ length: 10 }, (_, i) => readinessRecord(`2026-01-${String(i + 20).padStart(2, '0')}`, 70));
    const summary = buildPerformanceSummary(baseInput({ recentLogs30, readinessRecords30 }));
    expect(summary.weight.hasData).toBe(true);
    expect(summary.readiness.hasData).toBe(true);
  });

  it('Z: determinism — identical input always produces an identical summary', () => {
    const history: ExercisePerformanceLog[] = [
      { date: '2026-01-01', exerciseName: 'Back Squat', prescribedSets: 3, completedSets: 3, loadKg: 60, repsAchieved: 8, wasModified: false, submittedAt: '2026-01-01T12:00:00.000Z' },
      { date: '2026-01-08', exerciseName: 'Back Squat', prescribedSets: 3, completedSets: 3, loadKg: 62.5, repsAchieved: 8, wasModified: false, submittedAt: '2026-01-08T12:00:00.000Z' },
    ];
    const input = baseInput({ exerciseNames: ['Back Squat'], getExerciseHistory: () => history });
    const a = buildPerformanceSummary(input);
    const b = buildPerformanceSummary({ ...input, getExerciseHistory: () => [...history] });
    expect(a).toEqual(b);
  });

  it('never crashes / produces NaN or Infinity for a maximally sparse+odd input (spec §27)', () => {
    const summary = buildPerformanceSummary(
      baseInput({
        recentLogs30: [],
        plannedPerWeek: 0,
        weightFallbackKg: 0,
        nutritionTargets: { calories: 0, proteinG: 0 },
      })
    );
    expect(Number.isFinite(summary.trainingConsistency.completionPct)).toBe(true);
    expect(Number.isFinite(summary.trainingConsistency.plannedSessions)).toBe(true);
    expect(summary.goalProgress.overallScore === null || Number.isFinite(summary.goalProgress.overallScore)).toBe(true);
  });
});
