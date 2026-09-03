import { describe, expect, it } from 'vitest';
import { buildExerciseMetrics, detectPersonalRecords, latestExposureSetPersonalRecord } from './exerciseMetrics';
import type { ExercisePerformanceLog } from '../progression/types';

/** Performance test matrix (spec §29): A-N, S. */

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

describe('buildExerciseMetrics', () => {
  it('A: empty history -> insufficient_data, no fabricated numbers', () => {
    const metrics = buildExerciseMetrics('Back Squat', []);
    expect(metrics.totalExposures).toBe(0);
    expect(metrics.current).toBeNull();
    expect(metrics.previous).toBeNull();
    expect(metrics.best).toBeNull();
    expect(metrics.trend.state).toBe('insufficient_data');
    expect(metrics.personalRecords).toEqual([]);
  });

  it('B: one exposure -> current is set, trend is still insufficient_data (spec §31 invariant #2)', () => {
    const history = [log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 })];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.current).not.toBeNull();
    expect(metrics.current?.value).toBe(60);
    expect(metrics.previous).toBeNull();
    expect(metrics.trend.state).toBe('insufficient_data');
  });

  it('C/D: multiple improving exposures -> improving trend, correct previous/current', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 62.5, repsAchieved: 8 }),
      log({ date: '2026-01-15', loadKg: 65, repsAchieved: 8 }),
      log({ date: '2026-01-22', loadKg: 67.5, repsAchieved: 8 }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.trend.state).toBe('improving');
    expect(metrics.current?.value).toBe(67.5);
    expect(metrics.previous?.value).toBe(65);
    expect(metrics.best?.value).toBe(67.5);
  });

  it('E: stable performance -> stable trend', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-15', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-22', loadKg: 60, repsAchieved: 8 }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.trend.state).toBe('stable');
  });

  it('F: declining performance -> declining trend', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 70, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 67.5, repsAchieved: 8 }),
      log({ date: '2026-01-15', loadKg: 65, repsAchieved: 8 }),
      log({ date: '2026-01-22', loadKg: 60, repsAchieved: 8 }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.trend.state).toBe('declining');
  });

  it('G: insufficient data (a single fully-completed exposure among several missed ones)', () => {
    const history = [
      log({ date: '2026-01-01', completedSets: 0, loadKg: undefined }),
      log({ date: '2026-01-08', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-15', completedSets: 1 }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.trend.state).toBe('insufficient_data');
  });

  it('H: rep-range progression model reads repsAchieved as the primary metric', () => {
    const history = [
      log({ date: '2026-01-01', exerciseName: 'Push Up', loadKg: undefined, repsAchieved: 10 }),
      log({ date: '2026-01-08', exerciseName: 'Push Up', loadKg: undefined, repsAchieved: 14 }),
    ];
    const metrics = buildExerciseMetrics('Push Up', history);
    expect(metrics.model).toBe('rep_range');
    expect(metrics.trend.state).toBe('improving');
    expect(metrics.current?.value).toBe(14);
  });

  it('I: load progression model reads loadKg as the primary metric', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 65, repsAchieved: 8 }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.model).toBe('load');
    expect(metrics.current?.value).toBe(65);
  });

  it('J: distance progression model reads distanceM', () => {
    const history = [
      log({ date: '2026-01-01', exerciseName: '400m Run', loadKg: undefined, distanceM: 350 }),
      log({ date: '2026-01-08', exerciseName: '400m Run', loadKg: undefined, distanceM: 400 }),
    ];
    const metrics = buildExerciseMetrics('400m Run', history);
    expect(metrics.model).toBe('distance');
    expect(metrics.trend.state).toBe('improving');
  });

  it('K: duration progression model reads durationSec', () => {
    const history = [
      log({ date: '2026-01-01', exerciseName: 'Plank', loadKg: undefined, durationSec: 30 }),
      log({ date: '2026-01-08', exerciseName: 'Plank', loadKg: undefined, durationSec: 45 }),
    ];
    const metrics = buildExerciseMetrics('Plank', history);
    expect(metrics.model).toBe('duration');
    expect(metrics.trend.state).toBe('improving');
  });

  it('L: technique model has no numeric trend and never produces a PR', () => {
    const history = [
      log({ date: '2026-01-01', exerciseName: 'Sprint Drill', loadKg: undefined }),
      log({ date: '2026-01-08', exerciseName: 'Sprint Drill', loadKg: undefined }),
    ];
    const metrics = buildExerciseMetrics('Sprint Drill', history);
    expect(metrics.model).toBe('technique');
    expect(metrics.current).toBeNull(); // primaryMetric has nothing numeric to report
    expect(metrics.personalRecords).toEqual([]);
  });

  it('M: PR detection — a strictly higher load at the SAME rep count is a new PR', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 10 }),
      log({ date: '2026-01-08', loadKg: 62.5, repsAchieved: 10 }),
    ];
    const records = detectPersonalRecords('Back Squat', 'load', history);
    expect(records).toHaveLength(1);
    expect(records[0].bracketLabel).toBe('10 reps');
    expect(records[0].value).toBe(62.5);
    expect(records[0].isRecent).toBe(true);

    const newPr = latestExposureSetPersonalRecord('Back Squat', 'load', history);
    expect(newPr?.value).toBe(62.5);
  });

  it('N: non-comparable PR rejection — 70kg×10 vs 72.5kg×8 are never compared to each other', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 70, repsAchieved: 10 }),
      log({ date: '2026-01-08', loadKg: 72.5, repsAchieved: 8 }),
    ];
    const records = detectPersonalRecords('Back Squat', 'load', history);
    // Two SEPARATE brackets, each its own PR — never merged into one "best".
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.bracketLabel === '10 reps')?.value).toBe(70);
    expect(records.find((r) => r.bracketLabel === '8 reps')?.value).toBe(72.5);

    // Neither is a "new" record because each bracket has only ONE
    // exposure ever — insufficient evidence to claim either beat anything.
    const newPr = latestExposureSetPersonalRecord('Back Squat', 'load', history);
    expect(newPr).toBeNull();
  });

  it('N: a tie does not count as a new PR (must be strictly greater)', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 70, repsAchieved: 10 }),
      log({ date: '2026-01-08', loadKg: 70, repsAchieved: 10 }),
    ];
    const newPr = latestExposureSetPersonalRecord('Back Squat', 'load', history);
    expect(newPr).toBeNull();
  });

  it('N: PR is never claimed for a load exposure missing its rep count (not comparable)', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: undefined }),
      log({ date: '2026-01-08', loadKg: 65, repsAchieved: undefined }),
    ];
    const records = detectPersonalRecords('Back Squat', 'load', history);
    expect(records).toEqual([]);
  });

  it('O/comparability: a partial completion is excluded from trend/PR/current/previous', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 65, repsAchieved: 8, completedSets: 1, prescribedSets: 3 }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.current?.value).toBe(60); // the partial session never becomes "current"
    expect(metrics.failedOrPartialExposures).toBe(1);
    expect(metrics.successfulExposures).toBe(1);
  });

  it('P/comparability: a missed session (completedSets 0) is excluded from trend/PR', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 0, repsAchieved: 0, completedSets: 0 }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.current?.value).toBe(60);
    expect(metrics.trend.state).toBe('insufficient_data'); // only one comparable point remains
  });

  it('Q: a Travel-context exposure is counted but never becomes comparable trend/PR evidence', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 20, repsAchieved: 15, contextMode: 'travel' }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.contextualExposureCount).toBe(1);
    expect(metrics.current?.value).toBe(60); // the travel session never overwrites "current"
    expect(metrics.trend.state).toBe('insufficient_data');
    // The normal 8-rep exposure still stands as its own bracket's record;
    // the travel-context 15-rep exposure never creates a "15 reps" bracket.
    expect(metrics.personalRecords).toHaveLength(1);
    expect(metrics.personalRecords[0].bracketLabel).toBe('8 reps');
  });

  it('R: a Competition-context exposure is counted but never becomes comparable trend/PR evidence', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 40, repsAchieved: 8, contextMode: 'competition' }),
    ];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.contextualExposureCount).toBe(1);
    expect(metrics.current?.value).toBe(60);
  });

  it('S: a substituted exercise builds its OWN independent metrics, never contaminating the original', () => {
    const originalHistory = [log({ date: '2026-01-01', exerciseName: 'Barbell Squat', loadKg: 80, repsAchieved: 8 })];
    const substituteHistory = [
      log({ date: '2026-01-08', exerciseName: 'Goblet Squat', loadKg: 20, repsAchieved: 15, wasModified: true, originalExerciseName: 'Barbell Squat' }),
    ];
    const originalMetrics = buildExerciseMetrics('Barbell Squat', originalHistory);
    const substituteMetrics = buildExerciseMetrics('Goblet Squat', substituteHistory);

    // Each exercise name's history is completely independent.
    expect(originalMetrics.totalExposures).toBe(1);
    expect(originalMetrics.current?.value).toBe(80);
    expect(substituteMetrics.totalExposures).toBe(1);
    expect(substituteMetrics.current?.value).toBe(20);
    // The substitute's strong performance never reads back as evidence the
    // original (Barbell Squat) improved.
    expect(originalMetrics.trend.state).toBe('insufficient_data');
  });

  it('reads the sportRelevance metadata passed in, never branches on sport itself', () => {
    const history = [log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 })];
    const metrics = buildExerciseMetrics('Back Squat', history, { sportRelevance: 'primary' });
    expect(metrics.sportRelevance).toBe('primary');
  });

  it('honestly attaches null latestProgressionDecision when none is supplied (never fabricated)', () => {
    const history = [log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 })];
    const metrics = buildExerciseMetrics('Back Squat', history);
    expect(metrics.latestProgressionDecision).toBeNull();
  });

  it('Z: determinism — same history always produces the same metrics', () => {
    const history = [
      log({ date: '2026-01-01', loadKg: 60, repsAchieved: 8 }),
      log({ date: '2026-01-08', loadKg: 62.5, repsAchieved: 8 }),
    ];
    const a = buildExerciseMetrics('Back Squat', history);
    const b = buildExerciseMetrics('Back Squat', [...history]);
    expect(a).toEqual(b);
  });
});
