import { describe, expect, it } from 'vitest';
import { applyProgression, computeProgressionInfo } from './progressionEngine';
import { localDateKey, addDays } from './dateUtils';

const PLAN_START = '2026-01-05'; // a Monday

function dayLog(date: string, workoutCompleted: boolean) {
  return { date, workoutCompleted };
}

/** Builds a log entry for every day of `weekIndex` (0-based from PLAN_START) with
 * `completedCount` of the 7 days marked as completed workouts. */
function weekLogs(weekIndex: number, completedCount: number) {
  const start = addDays(new Date(2026, 0, 5), weekIndex * 7);
  return Array.from({ length: 7 }, (_, i) => dayLog(localDateKey(addDays(start, i)), i < completedCount));
}

describe('applyProgression', () => {
  it('adds no bonus sets in the first block (weeks 1-4)', () => {
    const ex = { sets: 3, category: 'strength' as const };
    expect(applyProgression(ex, 1).sets).toBe(3);
    expect(applyProgression(ex, 4).sets).toBe(3);
  });

  it('adds one bonus set starting week 5, capped at +2', () => {
    const ex = { sets: 3, category: 'strength' as const };
    expect(applyProgression(ex, 5).sets).toBe(4);
    expect(applyProgression(ex, 9).sets).toBe(5);
    expect(applyProgression(ex, 100).sets).toBe(5); // capped at MAX_BONUS_SETS = 2
  });

  it('never adjusts conditioning/warmup/cooldown volume', () => {
    const ex = { sets: 3, category: 'conditioning' as const };
    expect(applyProgression(ex, 20).sets).toBe(3);
  });
});

describe('computeProgressionInfo — calendar-aware progression', () => {
  it('with no plan start date, holds at week 1 (pre-assessment)', () => {
    const info = computeProgressionInfo(null, [], 3, new Date(2026, 5, 1));
    expect(info).toEqual({ planStartDate: null, currentPlanWeek: 1, progressionWeek: 1 });
  });

  it('currentPlanWeek advances by real calendar weeks, independent of logged history', () => {
    const info = computeProgressionInfo(PLAN_START, [], 3, new Date(2026, 0, 20)); // 15 days later
    expect(info.currentPlanWeek).toBe(3); // days 0-6 = wk1, 7-13 = wk2, 14-20 = wk3
  });

  it('progressionWeek stays at 1 during the first (still in-progress) calendar week', () => {
    const info = computeProgressionInfo(PLAN_START, weekLogs(0, 3), 3, new Date(2026, 0, 8));
    expect(info.currentPlanWeek).toBe(1);
    expect(info.progressionWeek).toBe(1);
  });

  it('advances progressionWeek for a fully-elapsed week where the athlete met their planned frequency', () => {
    // Week 0 (Jan 5-11): 3/3 planned sessions completed. Evaluated from Jan 15 (week 2).
    const logs = weekLogs(0, 3);
    const info = computeProgressionInfo(PLAN_START, logs, 3, new Date(2026, 0, 15));
    expect(info.currentPlanWeek).toBe(2);
    expect(info.progressionWeek).toBe(2);
  });

  it('regression: a missed week does not earn progression', () => {
    // Week 0: only 1 of 3 planned sessions completed (well under the 50% threshold).
    const logs = weekLogs(0, 1);
    const info = computeProgressionInfo(PLAN_START, logs, 3, new Date(2026, 0, 15));
    expect(info.currentPlanWeek).toBe(2);
    expect(info.progressionWeek).toBe(1); // frozen — the missed week was not credited
  });

  it('a stalled week blocks progression even if later weeks were fully completed', () => {
    // Week 0 missed, week 1 fully completed — progression must not skip past the gap.
    const logs = [...weekLogs(0, 0), ...weekLogs(1, 3)];
    const info = computeProgressionInfo(PLAN_START, logs, 3, new Date(2026, 0, 22)); // week 3
    expect(info.currentPlanWeek).toBe(3);
    expect(info.progressionWeek).toBe(1);
  });

  it('a calendar gap with zero logs is treated the same as a missed week, not a crash', () => {
    const info = computeProgressionInfo(PLAN_START, [], 4, new Date(2026, 1, 15)); // ~6 weeks later, no logs at all
    expect(info.currentPlanWeek).toBeGreaterThan(1);
    expect(info.progressionWeek).toBe(1);
  });

  it('is resilient to a corrupt/malformed planStartDate — fails safe to week 1 instead of NaN/throwing', () => {
    const info = computeProgressionInfo('not-a-date', [], 3, new Date(2026, 0, 20));
    expect(Number.isNaN(info.currentPlanWeek)).toBe(false);
    expect(info).toEqual({ planStartDate: null, currentPlanWeek: 1, progressionWeek: 1 });
  });

  it('is resilient to a plan start date in the future (clock skew) — never negative', () => {
    const info = computeProgressionInfo('2099-01-01', [], 3, new Date(2026, 0, 20));
    expect(info.currentPlanWeek).toBe(1);
    expect(info.progressionWeek).toBe(1);
  });

  it('holds at week 1 when the athlete has no planned frequency yet, rather than dividing by zero', () => {
    const info = computeProgressionInfo(PLAN_START, weekLogs(0, 0), 0, new Date(2026, 0, 15));
    expect(Number.isNaN(info.progressionWeek)).toBe(false);
    expect(info.progressionWeek).toBe(1);
  });
});
