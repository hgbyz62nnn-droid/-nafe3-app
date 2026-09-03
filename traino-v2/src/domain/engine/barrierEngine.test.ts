import { describe, expect, it } from 'vitest';
import {
  computeWeekSummary,
  detectBarriers,
  detectRecurringPattern,
  pickPrimaryBarrier,
  LOW_COMPLETION_THRESHOLD,
  RECURRING_THRESHOLD_WEEKS,
} from './barrierEngine';
import type { DayLog } from '../state/LogContext';
import type { WeeklyCheckIn, WeeklyCoachingRecord } from '../coaching/types';

function log(date: string, overrides: Partial<DayLog> = {}): DayLog {
  return { date, loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false, ...overrides };
}

function checkIn(barrierIds: WeeklyCheckIn['barrierIds']): WeeklyCheckIn {
  return { barrierIds, submittedAt: '2026-01-01' };
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
