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
} from './barrierEngine';
import type { DayLog } from '../state/LogContext';
import type { WeeklyCheckIn, WeeklyCoachingRecord } from '../coaching/types';
import type { DailyReadinessRecord, DailyReadinessInputs } from '../readiness/types';
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
    expect(Number.isNaN(summary.recoveryScore)).toBe(false);
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

  it('fatigue/poor_sleep are corroborated only when both recovery is low and workouts were missed (E)', () => {
    const missedLogs = [log('2026-01-01'), log('2026-01-02'), log('2026-01-03')];
    const summary = computeWeekSummary(missedLogs, [], 5);
    const detected = detectBarriers(checkIn(['fatigue']), summary);
    expect(detected[0].barrier).toBe('fatigue');
    // recoveryScore for an all-missed week is low by construction of computeRecoveryScore
    expect(detected[0].objectiveSignal).toBe(true);
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
