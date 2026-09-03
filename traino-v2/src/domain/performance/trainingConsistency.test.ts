import { describe, expect, it } from 'vitest';
import { buildTrainingConsistency } from './trainingConsistency';
import type { DayLog } from '../state/LogContext';
import type { TravelContext, CompetitionEvent } from '../context/types';

function day(date: string, completed: boolean): DayLog {
  return { date, loggedMealSlots: [], mealOverrides: {}, workoutCompleted: completed };
}

const WEEK = ['2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06', '2026-02-07', '2026-02-08'];

describe('buildTrainingConsistency', () => {
  it('A: no travel/competition -> plain completed/planned', () => {
    const logs = WEEK.map((d, i) => day(d, i < 3));
    const result = buildTrainingConsistency(logs, 4, [], []);
    expect(result.plannedSessions).toBe(4);
    expect(result.completedSessions).toBe(3);
    expect(result.completionPct).toBe(75);
    expect(result.adjustedSessions).toBe(0);
  });

  it('O: a partial/missed week still reports honest numbers, never negative', () => {
    const logs = WEEK.map((d) => day(d, false));
    const result = buildTrainingConsistency(logs, 4, [], []);
    expect(result.completedSessions).toBe(0);
    expect(result.completionPct).toBe(0);
  });

  it('P: intentionally-skipped competition day is never counted as a missed workout', () => {
    const events: CompetitionEvent[] = [
      { id: 'e1', mode: 'competition', eventDate: '2026-02-05', eventType: 'match', createdAt: '2026-01-01T00:00:00.000Z', source: 'athlete' },
    ];
    const logs = WEEK.map((d) => day(d, d !== '2026-02-05'));
    const result = buildTrainingConsistency(logs, 5, [], events);
    // The event day contributes 0 to plannedSessions (context-adjusted),
    // so it's never scored as "missed" — completionPct should reflect that.
    expect(result.intentionallySkippedCompetitionSessions).toBe(1);
    expect(result.plannedSessions).toBeLessThan(5);
  });

  it('Q: a travel-context day that was completed counts as an adjusted session, not a normal one', () => {
    const travel: TravelContext[] = [
      {
        id: 't1',
        mode: 'travel',
        startDate: '2026-02-02',
        endDate: '2026-02-08',
        constraints: { equipmentIds: [], locationIds: ['home'], time: { minutesAvailable: 20 }, affectsNutrition: false },
        createdAt: '2026-01-01T00:00:00.000Z',
        source: 'athlete',
      },
    ];
    const logs = WEEK.map((d, i) => day(d, i < 3));
    const result = buildTrainingConsistency(logs, 4, travel, []);
    expect(result.travelAdjustedSessions).toBe(3);
    expect(result.adjustedSessions).toBe(3);
  });

  it('R: a competition taper day (not event day) that was completed counts as adjusted', () => {
    const events: CompetitionEvent[] = [
      { id: 'e1', mode: 'competition', eventDate: '2026-02-10', eventType: 'match', createdAt: '2026-01-01T00:00:00.000Z', source: 'athlete' },
    ];
    // 2026-02-08 is 2 days before the event -> 'very_near' phase, not event day.
    const logs = WEEK.map((d) => day(d, d === '2026-02-08'));
    const result = buildTrainingConsistency(logs, 4, [], events);
    expect(result.adjustedSessions).toBeGreaterThanOrEqual(1);
    expect(result.intentionallySkippedCompetitionSessions).toBe(0);
  });

  it('never divides by zero / never produces NaN when nothing is planned', () => {
    const logs = WEEK.map((d) => day(d, false));
    const result = buildTrainingConsistency(logs, 0, [], []);
    expect(Number.isFinite(result.completionPct)).toBe(true);
    expect(result.hasData).toBe(false);
  });

  it('Z: determinism', () => {
    const logs = WEEK.map((d, i) => day(d, i < 3));
    const a = buildTrainingConsistency(logs, 4, [], []);
    const b = buildTrainingConsistency([...logs], 4, [], []);
    expect(a).toEqual(b);
  });
});
