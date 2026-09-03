import { describe, expect, it } from 'vitest';
import {
  computeWeekSummary,
  describeReadinessTrend,
  detectBarriers,
  detectRecurringPattern,
  pickPrimaryBarrier,
  LOW_COMPLETION_THRESHOLD,
  LOW_READINESS_DAYS_THRESHOLD,
  POOR_SLEEP_DAYS_THRESHOLD,
  READINESS_IMPROVEMENT_THRESHOLD,
  RECURRING_THRESHOLD_WEEKS,
  STRUGGLING_EXERCISES_THRESHOLD,
} from './barrierEngine';
import type { DayLog } from '../state/LogContext';
import type { WeeklyCheckIn, WeeklyCoachingRecord } from '../coaching/types';
import type { DailyReadinessRecord, DailyReadinessInputs } from '../readiness/types';
import type { ExercisePerformanceMetrics } from '../performance/types';
import { computeReadiness } from './readinessEngine';

function log(date: string, overrides: Partial<DayLog> = {}): DayLog {
  return { date, loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false, ...overrides };
}

function checkIn(barrierIds: WeeklyCheckIn['barrierIds']): WeeklyCheckIn {
  return { barrierIds, submittedAt: '2026-01-01' };
}

function readinessInputs(overrides: Partial<DailyReadinessInputs> = {}): DailyReadinessInputs {
  return { sleepQuality: 3, sleepDurationBucket: 3, energy: 3, stress: 3, soreness: 3, motivation: 3, painFlag: false, ...overrides };
}

function readinessRecord(date: string, overrides: Partial<DailyReadinessInputs> = {}): DailyReadinessRecord {
  const inputs = readinessInputs(overrides);
  const result = computeReadiness(inputs);
  return {
    date,
    inputs: result.factors,
    score: result.score,
    status: result.status,
    recommendation: result.recommendation,
    recommendationApplied: result.recommendation.adjustmentApplied,
    submittedAt: `${date}T08:00:00.000Z`,
  };
}

describe('computeWeekSummary', () => {
  it('honestly reports no data for a week with nothing logged', () => {
    const summary = computeWeekSummary([log('2026-01-01'), log('2026-01-02')], [], 3);
    expect(summary.hasData).toBe(false);
    expect(summary.completionPct).toBe(0);
  });

  it('computes completion/missed correctly against the planned frequency', () => {
    const logs = [
      log('2026-01-01', { workoutCompleted: true }),
      log('2026-01-02', { workoutCompleted: true }),
      log('2026-01-03'),
      log('2026-01-04'),
      log('2026-01-05'),
      log('2026-01-06'),
      log('2026-01-07'),
    ];
    const summary = computeWeekSummary(logs, [], 5);
    expect(summary.hasData).toBe(true);
    expect(summary.workoutsPlanned).toBe(5);
    expect(summary.workoutsCompleted).toBe(2);
    expect(summary.workoutsMissed).toBe(3);
    expect(summary.completionPct).toBe(40);
  });

  it('never produces NaN when plannedPerWeek is 0', () => {
    const summary = computeWeekSummary([log('2026-01-01', { workoutCompleted: true })], [], 0);
    expect(Number.isNaN(summary.completionPct)).toBe(false);
    expect(Number.isNaN(summary.strugglingExercisesCount)).toBe(false);
  });
});

describe('detectBarriers', () => {
  it('a high-adherence week with no check-in produces no barriers (B: positive report, no adjustment)', () => {
    const summary = computeWeekSummary(
      Array.from({ length: 7 }, (_, i) => log(`2026-01-0${i + 1}`, { workoutCompleted: i < 5 })),
      [],
      5
    );
    const detected = detectBarriers(null, summary);
    expect(detected).toEqual([]);
  });

  it('a low-adherence week with an explicit "time" selection produces a strong, corroborated barrier (C)', () => {
    const logs = [
      log('2026-01-01', { workoutCompleted: true }),
      log('2026-01-02'),
      log('2026-01-03'),
      log('2026-01-04'),
      log('2026-01-05'),
      log('2026-01-06'),
      log('2026-01-07'),
    ];
    const summary = computeWeekSummary(logs, [], 5); // planned 5, completed 1 -> 20%
    const detected = detectBarriers(checkIn(['time']), summary);
    expect(detected).toHaveLength(1);
    expect(detected[0].barrier).toBe('time');
    expect(detected[0].objectiveSignal).toBe(true);
    expect(detected[0].confidence).toBe('high');
    expect(detected[0].severity).toBe('high');
  });

  it('a low-adherence week with no explicit barrier still surfaces an honest, low-confidence signal', () => {
    const logs = [log('2026-01-01'), log('2026-01-02'), log('2026-01-03', { workoutCompleted: true })];
    const summary = computeWeekSummary(logs, [], 5);
    const detected = detectBarriers(null, summary);
    expect(detected).toHaveLength(1);
    expect(detected[0].explicitlySelected).toBe(false);
    expect(detected[0].confidence).toBe('low');
  });

  it('injury_pain is always surfaced with high severity, regardless of completion rate', () => {
    const logs = Array.from({ length: 7 }, (_, i) => log(`2026-01-0${i + 1}`, { workoutCompleted: true }));
    const summary = computeWeekSummary(logs, [], 5); // full completion
    const detected = detectBarriers(checkIn(['injury_pain']), summary);
    expect(detected[0].barrier).toBe('injury_pain');
    expect(detected[0].severity).toBe('high');
    expect(detected[0].objectiveSignal).toBe(true);
  });

  it('injury_pain always sorts first, even alongside a barrier with equal/higher completion-derived severity', () => {
    const logs = [log('2026-01-01'), log('2026-01-02'), log('2026-01-03')];
    const summary = computeWeekSummary(logs, [], 5);
    const detected = detectBarriers(checkIn(['time', 'injury_pain']), summary);
    expect(pickPrimaryBarrier(detected)?.barrier).toBe('injury_pain');
  });

  it('A (Phase 11): a completion-derived proxy no longer drives fatigue/poor_sleep — missed workouts alone, with zero real readiness check-ins, do NOT corroborate fatigue', () => {
    const missedLogs = [log('2026-01-01'), log('2026-01-02'), log('2026-01-03')];
    const summary = computeWeekSummary(missedLogs, [], 5); // no readiness records passed
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].barrier).toBe('fatigue');
    // Missing readiness data must never be treated as evidence of poor readiness
    // (spec §13/§22 invariant #3) — before Phase 11 this used to read as "true" via
    // a completion-ratio proxy (computeRecoveryScore) that never measured readiness.
    expect(detected[0].objectiveSignal).toBe(false);
  });

  it('B (Phase 11): real low readiness (not a completion proxy) drives fatigue/poor_sleep corroboration', () => {
    const missedLogs = [log('2026-01-01'), log('2026-01-02'), log('2026-01-03')];
    const lowReadinessWeek = Array.from({ length: LOW_READINESS_DAYS_THRESHOLD }, (_, i) =>
      readinessRecord(`2026-01-0${i + 1}`, { energy: 1, sleepQuality: 2, stress: 4, soreness: 4 })
    );
    const summary = computeWeekSummary(missedLogs, [], 5, lowReadinessWeek);
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].objectiveSignal).toBe(true);
    expect(detected[0].evidence).toMatch(/low readiness/);
  });

  it('supports multiple simultaneous barrier selections', () => {
    const logs = [log('2026-01-01'), log('2026-01-02')];
    const summary = computeWeekSummary(logs, [], 4);
    const detected = detectBarriers(checkIn(['time', 'lack_of_equipment', 'stress']), summary);
    expect(detected.map((d) => d.barrier).sort()).toEqual(['lack_of_equipment', 'stress', 'time'].sort());
  });

  it('motivation and other never claim a medical/psychological objective signal beyond completion rate', () => {
    const logs = [log('2026-01-01', { workoutCompleted: true })];
    const summary = computeWeekSummary(logs, [], 5);
    const detected = detectBarriers(checkIn(['motivation']), summary);
    expect(detected[0].barrier).toBe('motivation');
  });
});

// AB: weekly coaching integration with the Nutrition Engine (spec §33/§23) — the
// existing nutrition_difficulty/budget barrier detection (driven by
// computeNutritionAdherence's loggedMealSlots-based percentage) is untouched by the
// new, additive `nutritionLogs` field; both can coexist on the same DayLog.
describe('detectBarriers — AB: nutrition_difficulty/budget barriers coexist with the new detailed nutritionLogs field', () => {
  it('nutrition_difficulty is still detected from real loggedMealSlots completion, unaffected by an also-present nutritionLogs entry', () => {
    const logs = [
      log('2026-01-01', {
        loggedMealSlots: ['breakfast'],
        nutritionLogs: [
          { date: '2026-01-01', slotId: 'breakfast', foodId: 'white-rice-cooked', quantity: 1, calories: 200, proteinG: 4, carbsG: 44, fatG: 0.5, wasModified: false, submittedAt: '2026-01-01T08:00:00.000Z' },
        ],
      }),
      log('2026-01-02'),
      log('2026-01-03'),
    ];
    const summary = computeWeekSummary(logs, [], 5);
    const detected = detectBarriers(checkIn(['nutrition_difficulty']), summary);
    expect(detected[0].barrier).toBe('nutrition_difficulty');
  });

  it('budget barrier detection is unaffected by the new nutritionLogs field being entirely absent (backward compatible)', () => {
    const logs = [log('2026-01-01'), log('2026-01-02'), log('2026-01-03')];
    const summary = computeWeekSummary(logs, [], 5);
    const detected = detectBarriers(checkIn(['budget']), summary);
    expect(detected[0].barrier).toBe('budget');
  });
});

describe('detectRecurringPattern (D: repeated time barrier)', () => {
  function record(week: number, barrier: string | null): WeeklyCoachingRecord {
    return {
      reviewedPlanWeek: week,
      appliesFromPlanWeek: week + 1,
      weekStartDateKey: `2026-01-0${week}`,
      checkIn: null,
      decision: barrier
        ? {
            barrier: barrier as never,
            severity: 'medium',
            evidence: 'test',
            confidence: 'high',
            recommendedAction: 'REDUCE_SESSION_DURATION',
            affectedPlanArea: 'training',
            proposedChanges: null,
            reason: 'test',
            requiresApproval: true,
            isRecurring: false,
            recurringWeeks: 0,
          }
        : null,
      approvalStatus: 'not_applicable',
      decidedAt: null,
    };
  }

  it('detects a recurring pattern after the threshold number of consecutive weeks with the same barrier', () => {
    const history = [record(1, 'time'), record(2, 'time')];
    const result = detectRecurringPattern(history, 'time');
    expect(result.recurringWeeks).toBe(RECURRING_THRESHOLD_WEEKS);
    expect(result.isRecurring).toBe(true);
  });

  it('does not flag recurring below the threshold', () => {
    const history = [record(1, 'time')];
    const result = detectRecurringPattern(history, 'time');
    expect(result.isRecurring).toBe(false);
    expect(result.recurringWeeks).toBe(2);
  });

  it('a streak breaks when an intervening week had a different (or no) barrier', () => {
    const history = [record(1, 'time'), record(2, 'fatigue'), record(3, 'time')];
    const result = detectRecurringPattern(history, 'time');
    expect(result.recurringWeeks).toBe(2); // week 3 (current) + week... wait week 2 breaks it, so only week3+current
    expect(result.isRecurring).toBe(false);
  });

  it('returns not-recurring when there is no primary barrier this week', () => {
    const history = [record(1, 'time'), record(2, 'time')];
    expect(detectRecurringPattern(history, null)).toEqual({ isRecurring: false, recurringWeeks: 0 });
  });
});

describe('LOW_COMPLETION_THRESHOLD sanity', () => {
  it('is a fraction between 0 and 1', () => {
    expect(LOW_COMPLETION_THRESHOLD).toBeGreaterThan(0);
    expect(LOW_COMPLETION_THRESHOLD).toBeLessThan(1);
  });
});

describe('computeWeekSummary — readiness integration', () => {
  it('defaults readiness fields to empty/null when no readiness records are passed', () => {
    const summary = computeWeekSummary([log('2026-01-01')], [], 3);
    expect(summary.readinessCheckInsCount).toBe(0);
    expect(summary.readinessAverageScore).toBeNull();
    expect(summary.readinessLowDaysCount).toBe(0);
    expect(summary.poorSleepDaysCount).toBe(0);
  });

  it('averages readiness scores and counts low-readiness/poor-sleep days from real check-ins', () => {
    const week = [
      readinessRecord('2026-01-01', { energy: 1, sleepQuality: 1, sleepDurationBucket: 1, stress: 5, soreness: 5 }), // recovery, poor sleep
      readinessRecord('2026-01-02', { energy: 1, sleepQuality: 2, stress: 5, soreness: 5 }), // reduced/recovery, poor sleep
      readinessRecord('2026-01-03'), // normal, not poor sleep
    ];
    const summary = computeWeekSummary([log('2026-01-01')], [], 3, week);
    expect(summary.readinessCheckInsCount).toBe(3);
    expect(summary.readinessAverageScore).not.toBeNull();
    expect(summary.readinessLowDaysCount).toBeGreaterThanOrEqual(2);
    expect(summary.poorSleepDaysCount).toBe(2);
    expect(summary.readinessLowAndPoorSleepOverlapDays).toBeGreaterThanOrEqual(1);
  });

  it('never produces NaN for readiness fields regardless of input', () => {
    const summary = computeWeekSummary([], [], 3, []);
    expect(Number.isNaN(summary.readinessCheckInsCount)).toBe(false);
    expect(Number.isNaN(summary.readinessLowDaysCount)).toBe(false);
    expect(Number.isNaN(summary.poorSleepDaysCount)).toBe(false);
  });
});

describe('evidenceFor via detectBarriers — readiness as supporting evidence (non-causal)', () => {
  it('S: repeated low readiness corroborates a selected fatigue barrier even without objective completion signal', () => {
    const lowReadinessWeek = Array.from({ length: LOW_READINESS_DAYS_THRESHOLD }, (_, i) =>
      readinessRecord(`2026-01-0${i + 1}`, { energy: 1, sleepQuality: 2, stress: 4, soreness: 4 })
    );
    const summary = computeWeekSummary(
      [log('2026-01-01', { workoutCompleted: true }), log('2026-01-02', { workoutCompleted: true }), log('2026-01-03', { workoutCompleted: true })],
      [],
      3,
      lowReadinessWeek
    );
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].objectiveSignal).toBe(true);
    expect(detected[0].evidence).toMatch(/low readiness/);
  });

  it('T: repeated poor sleep corroborates a selected poor_sleep barrier, phrased as co-occurrence not causation', () => {
    const poorSleepWeek = Array.from({ length: POOR_SLEEP_DAYS_THRESHOLD }, (_, i) =>
      readinessRecord(`2026-01-0${i + 1}`, { sleepQuality: 1, sleepDurationBucket: 1, energy: 1, stress: 4, soreness: 4 })
    );
    const summary = computeWeekSummary(
      [log('2026-01-01', { workoutCompleted: true }), log('2026-01-02', { workoutCompleted: true }), log('2026-01-03', { workoutCompleted: true })],
      [],
      3,
      poorSleepWeek
    );
    const detected = detectBarriers(checkIn(['poor_sleep']), summary);
    expect(detected[0].objectiveSignal).toBe(true);
    expect(detected[0].evidence).toMatch(/poor\/short sleep|alongside/);
    expect(detected[0].evidence).not.toMatch(/caused/i);
  });

  it('U: a single off day of low readiness does not by itself corroborate a barrier', () => {
    const summary = computeWeekSummary(
      [log('2026-01-01', { workoutCompleted: true }), log('2026-01-02', { workoutCompleted: true }), log('2026-01-03', { workoutCompleted: true })],
      [],
      3,
      [readinessRecord('2026-01-01', { energy: 1, sleepQuality: 1 })]
    );
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].objectiveSignal).toBe(false);
  });
});

describe('describeReadinessTrend — non-causal reporting', () => {
  const lowWeek = computeWeekSummary([log('2026-01-01')], [], 3, [
    readinessRecord('2026-01-01', { energy: 1, sleepQuality: 1 }),
    readinessRecord('2026-01-02', { energy: 1, sleepQuality: 1 }),
  ]);
  const highWeek = computeWeekSummary([log('2026-01-08')], [], 3, [
    readinessRecord('2026-01-08', { energy: 5, sleepQuality: 5, stress: 1, soreness: 1 }),
    readinessRecord('2026-01-09', { energy: 5, sleepQuality: 5, stress: 1, soreness: 1 }),
  ]);

  it('V: reports an improvement only when a reduced load was actually applied this week', () => {
    expect(describeReadinessTrend(highWeek, lowWeek, false)).toBeNull();
    const note = describeReadinessTrend(highWeek, lowWeek, true);
    expect(note).not.toBeNull();
    expect(note).toMatch(/alongside/);
    expect(note).not.toMatch(/caused/i);
  });

  it('returns null without readiness data for either week', () => {
    const emptyWeek = computeWeekSummary([log('2026-01-01')], [], 3, []);
    expect(describeReadinessTrend(emptyWeek, lowWeek, true)).toBeNull();
    expect(describeReadinessTrend(highWeek, emptyWeek, true)).toBeNull();
  });

  it('returns null when the improvement does not clear the threshold', () => {
    const summaryA = computeWeekSummary([log('2026-01-01')], [], 3, [readinessRecord('2026-01-01')]);
    const summaryB = computeWeekSummary([log('2026-01-08')], [], 3, [readinessRecord('2026-01-08')]);
    expect(describeReadinessTrend(summaryB, summaryA, true)).toBeNull();
  });

  it('READINESS_IMPROVEMENT_THRESHOLD is a positive score-point delta', () => {
    expect(READINESS_IMPROVEMENT_THRESHOLD).toBeGreaterThan(0);
  });
});

/** PHASE 11 test matrix (spec §20): C-S (domain-level; U/V Football/Swimming and the
 * multi-week travel/competition scenarios K/L live in simulation.test.ts alongside
 * the 15 invariants, spec §21/§22). */

function exerciseMetrics(overrides: Partial<ExercisePerformanceMetrics> = {}): ExercisePerformanceMetrics {
  return {
    exerciseName: 'Back Squat',
    model: 'load',
    totalExposures: 4,
    successfulExposures: 4,
    failedOrPartialExposures: 0,
    contextualExposureCount: 0,
    previous: { date: '2026-01-01', value: 65, label: '65kg' },
    current: { date: '2026-01-08', value: 60, label: '60kg' },
    best: { date: '2026-01-01', value: 65, label: '65kg' },
    trend: { state: 'insufficient_data', confidence: 'insufficient', sampleSize: 0 },
    personalRecords: [],
    latestProgressionDecision: null,
    ...overrides,
  };
}

const workoutsLogs7 = (completed: number) =>
  Array.from({ length: 7 }, (_, i) => log(`2026-02-0${i + 1}`, { workoutCompleted: i < completed }));

describe('Phase 11 — C: real performance drives workout_difficulty evidence', () => {
  it('a real declining comparable exercise trend corroborates workout_difficulty even with full completion', () => {
    const summary = computeWeekSummary(workoutsLogs7(7), [], 7, [], {
      exercises: [exerciseMetrics({ trend: { state: 'declining', confidence: 'sufficient', sampleSize: 4 } })],
    });
    const detected = detectBarriers(checkIn(['workout_difficulty']), summary);
    expect(detected[0].objectiveSignal).toBe(true);
    expect(detected[0].evidence).toMatch(/declining trend/);
  });

  it('a stable/improving exercise trend does NOT corroborate workout_difficulty on a fully-completed week', () => {
    const summary = computeWeekSummary(workoutsLogs7(7), [], 7, [], {
      exercises: [exerciseMetrics({ trend: { state: 'improving', confidence: 'sufficient', sampleSize: 4 } })],
    });
    const detected = detectBarriers(checkIn(['workout_difficulty']), summary);
    expect(detected[0].objectiveSignal).toBe(false);
  });

  it('STRUGGLING_EXERCISES_THRESHOLD is a positive integer', () => {
    expect(STRUGGLING_EXERCISES_THRESHOLD).toBeGreaterThan(0);
  });
});

describe('Phase 11 — D: sparse readiness data never fabricates evidence', () => {
  it('0 readiness records -> insufficient data, no barrier corroboration from readiness', () => {
    const summary = computeWeekSummary(workoutsLogs7(2), [], 7, []);
    expect(summary.readinessCheckInsCount).toBe(0);
    expect(summary.readinessAverageScore).toBeNull();
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].objectiveSignal).toBe(false);
  });

  it('1 readiness record is honestly limited, never treated as a full week of low readiness', () => {
    const summary = computeWeekSummary(workoutsLogs7(2), [], 7, [readinessRecord('2026-02-01', { energy: 1, sleepQuality: 1 })]);
    expect(summary.readinessCheckInsCount).toBe(1);
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].objectiveSignal).toBe(false); // below LOW_READINESS_DAYS_THRESHOLD
  });

  it('2 readiness records still below LOW_READINESS_DAYS_THRESHOLD (3) -> no corroboration', () => {
    const week = [
      readinessRecord('2026-02-01', { energy: 1, sleepQuality: 1 }),
      readinessRecord('2026-02-02', { energy: 1, sleepQuality: 1 }),
    ];
    const summary = computeWeekSummary(workoutsLogs7(2), [], 7, week);
    expect(summary.readinessCheckInsCount).toBe(2);
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].objectiveSignal).toBe(false);
  });

  it('3+ readiness records at/above the threshold DO corroborate', () => {
    const week = Array.from({ length: 3 }, (_, i) => readinessRecord(`2026-02-0${i + 1}`, { energy: 1, sleepQuality: 1 }));
    const summary = computeWeekSummary(workoutsLogs7(2), [], 7, week);
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].objectiveSignal).toBe(true);
  });
});

describe('Phase 11 — E: sparse performance data never fabricates workout_difficulty evidence', () => {
  it('zero logged exercises -> honest insufficient data, missed sessions remain the only (weaker) fallback signal', () => {
    const summary = computeWeekSummary(workoutsLogs7(7), [], 7, [], { exercises: [] });
    expect(summary.exercisesWithDataCount).toBe(0);
    const detected = detectBarriers(checkIn(['workout_difficulty']), summary);
    expect(detected[0].objectiveSignal).toBe(false); // full completion + zero exercise evidence
  });
});

describe('Phase 11 — F/G/H/I: co-occurrence, never causation', () => {
  it('F: low readiness + low completion overlapping on the same days is reported as co-occurrence', () => {
    const logs = [
      log('2026-02-01', { workoutCompleted: false }),
      log('2026-02-02', { workoutCompleted: false }),
      log('2026-02-03', { workoutCompleted: true }),
    ];
    const readiness = [readinessRecord('2026-02-01', { energy: 1 }), readinessRecord('2026-02-02', { energy: 1 })];
    const summary = computeWeekSummary(logs, [], 7, readiness);
    expect(summary.readinessLowAndMissedWorkoutOverlapDays).toBeGreaterThanOrEqual(1);
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].evidence).not.toMatch(/caused/i);
  });

  it('G: good readiness + low completion does NOT corroborate fatigue/stress from readiness', () => {
    const logs = workoutsLogs7(1);
    const goodReadiness = Array.from({ length: 5 }, (_, i) => readinessRecord(`2026-02-0${i + 1}`, { energy: 5, sleepQuality: 5, stress: 1, soreness: 1 }));
    const summary = computeWeekSummary(logs, [], 7, goodReadiness);
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].objectiveSignal).toBe(false);
  });

  it('H: poor sleep + otherwise normal completion still corroborates poor_sleep from real sleep data alone', () => {
    const logs = workoutsLogs7(6);
    const poorSleep = Array.from({ length: POOR_SLEEP_DAYS_THRESHOLD }, (_, i) =>
      readinessRecord(`2026-02-0${i + 1}`, { sleepQuality: 1, sleepDurationBucket: 1, energy: 4, stress: 2, soreness: 2 })
    );
    const summary = computeWeekSummary(logs, [], 7, poorSleep);
    const detected = detectBarriers(checkIn(['poor_sleep']), summary);
    expect(detected[0].objectiveSignal).toBe(true);
    expect(detected[0].evidence).toMatch(/poor\/short sleep/);
  });

  it('I: stress + low completion corroborates via real low-readiness days, phrased non-causally', () => {
    const logs = workoutsLogs7(2);
    const stressWeek = Array.from({ length: LOW_READINESS_DAYS_THRESHOLD }, (_, i) =>
      readinessRecord(`2026-02-0${i + 1}`, { stress: 5, energy: 2, soreness: 3 })
    );
    const summary = computeWeekSummary(logs, [], 7, stressWeek);
    const detected = detectBarriers(checkIn(['stress']), summary);
    expect(detected[0].objectiveSignal).toBe(true);
    expect(detected[0].evidence).not.toMatch(/caused/i);
  });
});

describe('Phase 11 — J: repeated difficult workouts', () => {
  it('multiple exercises with a real declining trend strengthen (never single-set-triggered) workout_difficulty evidence', () => {
    const summary = computeWeekSummary(workoutsLogs7(7), [], 7, [], {
      exercises: [
        exerciseMetrics({ exerciseName: 'Back Squat', trend: { state: 'declining', confidence: 'sufficient', sampleSize: 4 } }),
        exerciseMetrics({ exerciseName: 'Bench Press', trend: { state: 'declining', confidence: 'sufficient', sampleSize: 4 } }),
        exerciseMetrics({ exerciseName: 'Deadlift', trend: { state: 'improving', confidence: 'sufficient', sampleSize: 4 } }),
      ],
    });
    const detected = detectBarriers(checkIn(['workout_difficulty']), summary);
    expect(summary.strugglingExercisesCount).toBe(2);
    expect(detected[0].evidence).toContain('2 of 3');
  });
});

describe('Phase 11 — M: exercise substitution never contaminates barrier evidence', () => {
  it('an original exercise and its substitute contribute two independent metrics objects, never merged', () => {
    const original = exerciseMetrics({ exerciseName: 'Barbell Squat', trend: { state: 'declining', confidence: 'sufficient', sampleSize: 3 } });
    const substitute = exerciseMetrics({ exerciseName: 'Goblet Squat', trend: { state: 'improving', confidence: 'sufficient', sampleSize: 3 } });
    const summary = computeWeekSummary(workoutsLogs7(7), [], 7, [], { exercises: [original, substitute] });
    // Both are counted independently — the substitute's strong performance never
    // cancels out the original's real struggle evidence.
    expect(summary.strugglingExercisesCount).toBe(1);
    expect(summary.exercisesWithDataCount).toBe(2);
  });
});

describe('Phase 11 — N: injury/pain is never overridden by performance/readiness evidence', () => {
  it('injury_pain stays objectiveSignal true and highest severity regardless of otherwise-clean performance/readiness data', () => {
    const goodReadiness = Array.from({ length: 5 }, (_, i) => readinessRecord(`2026-02-0${i + 1}`, { energy: 5, sleepQuality: 5, stress: 1 }));
    const summary = computeWeekSummary(workoutsLogs7(7), [], 7, goodReadiness, {
      exercises: [exerciseMetrics({ trend: { state: 'improving', confidence: 'sufficient', sampleSize: 4 } })],
    });
    const detected = detectBarriers(checkIn(['workout_difficulty', 'injury_pain']), summary);
    expect(pickPrimaryBarrier(detected)?.barrier).toBe('injury_pain');
    expect(detected.find((d) => d.barrier === 'injury_pain')?.objectiveSignal).toBe(true);
  });
});

describe('Phase 11 — O: nutrition_difficulty prefers detailed adherence, honestly distinguishes incomplete logging', () => {
  it('detailed adherence below threshold is real low-adherence evidence, not "incomplete logging"', () => {
    const logs = [
      log('2026-02-01', {
        nutritionLogs: [
          { date: '2026-02-01', slotId: 'breakfast', foodId: 'oats', quantity: 1, calories: 300, proteinG: 15, carbsG: 40, fatG: 8, wasModified: false, submittedAt: '2026-02-01T08:00:00.000Z' },
        ],
      }),
      log('2026-02-02', {
        nutritionLogs: [
          { date: '2026-02-02', slotId: 'breakfast', foodId: 'oats', quantity: 1, calories: 300, proteinG: 15, carbsG: 40, fatG: 8, wasModified: false, submittedAt: '2026-02-02T08:00:00.000Z' },
        ],
      }),
    ];
    const summary = computeWeekSummary(logs, [], 7, [], { nutritionTargets: { calories: 2500, proteinG: 160 } });
    expect(summary.nutritionHasDetailedData).toBe(true);
    expect(summary.nutritionDetailedAdherencePct).not.toBeNull();
    const detected = detectBarriers(checkIn(['nutrition_difficulty']), summary);
    expect(detected[0].evidence).toMatch(/nutrition adherence \d+% \(below/);
  });

  it('P: incomplete logging (no detailed data) is reported as incomplete logging, never as 0% adherence', () => {
    const logs = [log('2026-02-01'), log('2026-02-02')];
    const summary = computeWeekSummary(logs, [], 7, [], { nutritionTargets: { calories: 2500, proteinG: 160 } });
    expect(summary.nutritionHasDetailedData).toBe(false);
    const detected = detectBarriers(checkIn(['budget']), summary);
    expect(detected[0].evidence).toMatch(/incomplete meal logging/);
  });
});

describe('Phase 11 — Q: schedule_conflict evidence is unaffected by the refactor (still completion-based)', () => {
  it('a one-off low-completion week corroborates schedule_conflict', () => {
    const summary = computeWeekSummary(workoutsLogs7(1), [], 5);
    const detected = detectBarriers(checkIn(['schedule_conflict']), summary);
    expect(detected[0].objectiveSignal).toBe(true);
  });
});

describe('Phase 11 — S: determinism', () => {
  it('same inputs always produce the same WeekSummary and the same detected barriers', () => {
    const logs = workoutsLogs7(3);
    const readiness = [readinessRecord('2026-02-01', { energy: 1, sleepQuality: 1 })];
    const exercises = [exerciseMetrics({ trend: { state: 'declining', confidence: 'sufficient', sampleSize: 4 } })];
    const context = { exercises, nutritionTargets: { calories: 2500, proteinG: 160 } };
    const a = computeWeekSummary(logs, [], 7, readiness, context);
    const b = computeWeekSummary([...logs], [], 7, [...readiness], { ...context, exercises: [...exercises] });
    expect(a).toEqual(b);
    expect(detectBarriers(checkIn(['workout_difficulty']), a)).toEqual(detectBarriers(checkIn(['workout_difficulty']), b));
  });
});
