import { describe, expect, it } from 'vitest';
import { computeContextAdjustedPlannedSessions, describeWeekContextInfluence } from './weeklyCoachingIntegration';
import type { CompetitionEvent, TravelContext } from './types';

/** TRAVEL MODE + COMPETITION MODE test matrix (spec §33): AA — Weekly
 * Coaching integration (travel-adjusted sessions never look like normal
 * missed workouts, spec §21). */

const WEEK = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07'];

function travel(overrides: Partial<TravelContext> = {}): TravelContext {
  return {
    id: 't1',
    mode: 'travel',
    startDate: '2026-03-03',
    endDate: '2026-03-05',
    constraints: { equipmentIds: [], locationIds: ['home'], time: { minutesAvailable: 30 }, daysAvailablePerWeek: 2, affectsNutrition: false },
    createdAt: '2026-02-25T00:00:00.000Z',
    source: 'athlete',
    ...overrides,
  };
}

function event(overrides: Partial<CompetitionEvent> = {}): CompetitionEvent {
  return {
    id: 'e1',
    mode: 'competition',
    eventDate: '2026-03-05',
    eventType: 'match',
    createdAt: '2026-02-25T00:00:00.000Z',
    source: 'athlete',
    ...overrides,
  };
}

describe('computeContextAdjustedPlannedSessions — AA: never interprets travel-adjusted sessions as normal missed workouts', () => {
  it('with no travel/competition data, returns the athlete\'s normal weekly rate unchanged', () => {
    expect(computeContextAdjustedPlannedSessions(5, WEEK, [], [])).toBe(5);
  });

  it('reduces the planned count for days under an active travel context with a lower daysAvailablePerWeek override', () => {
    const result = computeContextAdjustedPlannedSessions(5, WEEK, [travel()], []);
    // 3 normal days (5/7 each) + 3 travel days (2/7 each) + no override on the 7th? recompute: startDate/endDate 03-03..03-05 = 3 days
    expect(result).toBeLessThan(5);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('a competition event day contributes nothing to the planned count — never looks like a missed session', () => {
    const withoutEvent = computeContextAdjustedPlannedSessions(7, WEEK, [], []);
    const withEvent = computeContextAdjustedPlannedSessions(7, WEEK, [], [event()]);
    expect(withEvent).toBeLessThan(withoutEvent);
  });

  it('never returns a negative planned count', () => {
    const result = computeContextAdjustedPlannedSessions(0, WEEK, [travel({ constraints: { ...travel().constraints, daysAvailablePerWeek: 0 } })], []);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe('describeWeekContextInfluence — narrative note (spec §21 examples)', () => {
  it('returns null when neither travel nor competition affected the week', () => {
    expect(describeWeekContextInfluence(WEEK, [], [])).toBeNull();
  });

  it('describes travel days when travel was active this week', () => {
    const note = describeWeekContextInfluence(WEEK, [travel()], []);
    expect(note).toMatch(/travel mode/i);
  });

  it('describes a competition event day', () => {
    const note = describeWeekContextInfluence(WEEK, [], [event()]);
    expect(note).toMatch(/competition/i);
  });

  it('describes a taper adjustment when the week fell within the preparation window but not on event day itself', () => {
    const farEnoughEvent = event({ eventDate: '2026-03-15' }); // near-phase relative to some of WEEK's dates
    const note = describeWeekContextInfluence(WEEK, [], [farEnoughEvent]);
    expect(note).toMatch(/competition|reduced/i);
  });
});
