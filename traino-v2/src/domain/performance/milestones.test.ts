import { describe, expect, it } from 'vitest';
import { buildMilestones } from './milestones';
import { buildExerciseMetrics } from './exerciseMetrics';
import type { ExercisePerformanceLog } from '../progression/types';
import type { NutritionProgressSummary, TrainingConsistencySummary } from './types';

const INSUFFICIENT = { state: 'insufficient_data' as const, confidence: 'insufficient' as const, sampleSize: 0 };

function log(overrides: Partial<ExercisePerformanceLog> & { date: string }): ExercisePerformanceLog {
  return {
    exerciseName: 'Back Squat',
    prescribedSets: 3,
    completedSets: 3,
    wasModified: false,
    submittedAt: `${overrides.date}T12:00:00.000Z`,
    ...overrides,
  };
}

function consistency(overrides: Partial<TrainingConsistencySummary> = {}): TrainingConsistencySummary {
  return { hasData: true, plannedSessions: 4, completedSessions: 4, adjustedSessions: 0, travelAdjustedSessions: 0, intentionallySkippedCompetitionSessions: 0, completionPct: 100, ...overrides };
}
function nutrition(overrides: Partial<NutritionProgressSummary> = {}): NutritionProgressSummary {
  return { hasDetailedData: false, caloriesAdherencePct: null, proteinAdherencePct: null, mealCompletionPct: 0, daysWithDetailedLogs: 0, trend: INSUFFICIENT, ...overrides };
}

describe('buildMilestones', () => {
  it('reports first_exposure only within the recent window', () => {
    const history = [log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 })];
    const metrics = buildExerciseMetrics('Back Squat', history);
    const milestones = buildMilestones({
      today: '2026-01-05',
      exercises: [{ exerciseName: 'Back Squat', history, metrics }],
      trainingConsistency: consistency({ hasData: false, plannedSessions: 0, completionPct: 0 }),
      nutrition: nutrition(),
    });
    expect(milestones.some((m) => m.type === 'first_exposure')).toBe(true);
  });

  it('does not report a milestone outside the recent window (stale history stays quiet)', () => {
    const history = [log({ date: '2025-01-01', loadKg: 60, repsAchieved: 8 })];
    const metrics = buildExerciseMetrics('Back Squat', history);
    const milestones = buildMilestones({
      today: '2026-01-05',
      exercises: [{ exerciseName: 'Back Squat', history, metrics }],
      trainingConsistency: consistency({ hasData: false, plannedSessions: 0, completionPct: 0 }),
      nutrition: nutrition(),
    });
    expect(milestones.some((m) => m.type === 'first_exposure')).toBe(false);
  });

  it('reports three_exposures at the third successful exposure', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-15', loadKg: 60, repsAchieved: 8 }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    const milestones = buildMilestones({
      today: '2026-01-16',
      exercises: [{ exerciseName: 'Back Squat', history, metrics }],
      trainingConsistency: consistency({ hasData: false, plannedSessions: 0, completionPct: 0 }),
      nutrition: nutrition(),
    });
    expect(milestones.some((m) => m.type === 'three_exposures')).toBe(true);
  });

  it('reports a new_personal_record when the latest exposure beats its bracket', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 65, repsAchieved: 8 }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    const milestones = buildMilestones({
      today: '2026-01-09',
      exercises: [{ exerciseName: 'Back Squat', history, metrics }],
      trainingConsistency: consistency({ hasData: false, plannedSessions: 0, completionPct: 0 }),
      nutrition: nutrition(),
    });
    expect(milestones.some((m) => m.type === 'new_personal_record')).toBe(true);
  });

  it('reports a consistency milestone only when the week was fully completed', () => {
    const full = buildMilestones({
      today: '2026-01-05',
      exercises: [],
      trainingConsistency: consistency({ completionPct: 100, plannedSessions: 4, completedSessions: 4 }),
      nutrition: nutrition(),
    });
    const partial = buildMilestones({
      today: '2026-01-05',
      exercises: [],
      trainingConsistency: consistency({ completionPct: 75, plannedSessions: 4, completedSessions: 3 }),
      nutrition: nutrition(),
    });
    expect(full.some((m) => m.type === 'consistency')).toBe(true);
    expect(partial.some((m) => m.type === 'consistency')).toBe(false);
  });

  it('never surfaces a gamification wall — stays short even with a lot of exercise history', () => {
    const exercises = Array.from({ length: 10 }, (_, i) => {
      const history = [log({ date: '2026-01-01', exerciseName: `Ex${i}`, loadKg: 40, repsAchieved: 8 })];
      return { exerciseName: `Ex${i}`, history, metrics: buildExerciseMetrics(`Ex${i}`, history) };
    });
    const milestones = buildMilestones({
      today: '2026-01-02',
      exercises,
      trainingConsistency: consistency({ hasData: false, plannedSessions: 0, completionPct: 0 }),
      nutrition: nutrition(),
    });
    // One first-exposure milestone per exercise at most — no duplicate/inflated entries.
    expect(milestones.length).toBe(10);
  });

  it('Z: determinism', () => {
    const history = [log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 })];
    const metrics = buildExerciseMetrics('Back Squat', history);
    const input = {
      today: '2026-01-02',
      exercises: [{ exerciseName: 'Back Squat', history, metrics }],
      trainingConsistency: consistency(),
      nutrition: nutrition({ hasDetailedData: true, caloriesAdherencePct: 85 }),
    };
    expect(buildMilestones(input)).toEqual(buildMilestones(input));
  });
});
