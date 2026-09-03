import { describe, expect, it } from 'vitest';
import { competitionPhaseForEvent, resolveActiveContext } from './resolveActiveContext';
import type { CompetitionEvent, TravelContext } from './types';

/**
 * TRAVEL MODE + COMPETITION MODE test matrix (spec §33): B/C (travel end/
 * expiration), Q/R/S (event-day/post-event/automatic expiration), T/U
 * (multiple events, overlap precedence), plus invariants #8-#10 (expired
 * contexts don't affect today, deterministic, no duplicate active context
 * unless supported).
 */

function travel(overrides: Partial<TravelContext> = {}): TravelContext {
  return {
    id: 'travel-1',
    mode: 'travel',
    startDate: '2026-03-01',
    endDate: '2026-03-10',
    constraints: { equipmentIds: [], locationIds: ['home'], time: { minutesAvailable: 30 }, affectsNutrition: false },
    createdAt: '2026-02-25T00:00:00.000Z',
    source: 'athlete',
    ...overrides,
  };
}

function event(overrides: Partial<CompetitionEvent> = {}): CompetitionEvent {
  return {
    id: 'event-1',
    mode: 'competition',
    eventDate: '2026-03-20',
    eventType: 'match',
    createdAt: '2026-02-25T00:00:00.000Z',
    source: 'athlete',
    ...overrides,
  };
}

describe('resolveActiveContext — travel window (B/C)', () => {
  it('resolves travel mode for a date inside the window', () => {
    const result = resolveActiveContext('2026-03-05', [travel()], []);
    expect(result.mode).toBe('travel');
    expect(result.travel?.id).toBe('travel-1');
  });

  it('resolves normal for a date after the travel window ends (automatic expiration, no manual reset)', () => {
    const result = resolveActiveContext('2026-03-11', [travel()], []);
    expect(result.mode).toBe('normal');
    expect(result.travel).toBeNull();
  });

  it('resolves normal for a date before the travel window starts', () => {
    const result = resolveActiveContext('2026-02-28', [travel()], []);
    expect(result.mode).toBe('normal');
  });

  it('the start and end dates are both inclusive', () => {
    expect(resolveActiveContext('2026-03-01', [travel()], []).mode).toBe('travel');
    expect(resolveActiveContext('2026-03-10', [travel()], []).mode).toBe('travel');
  });
});

describe('competitionPhaseForEvent — named phases (spec §11)', () => {
  it('classifies event day', () => {
    expect(competitionPhaseForEvent(event(), '2026-03-20')).toBe('event_day');
  });

  it('classifies very-near (within 2 days before)', () => {
    expect(competitionPhaseForEvent(event(), '2026-03-19')).toBe('very_near');
    expect(competitionPhaseForEvent(event(), '2026-03-18')).toBe('very_near');
  });

  it('classifies near (within the preparation window, beyond very-near)', () => {
    expect(competitionPhaseForEvent(event(), '2026-03-15')).toBe('near');
    expect(competitionPhaseForEvent(event(), '2026-03-10')).toBe('near');
  });

  it('classifies post-event within the recovery window', () => {
    expect(competitionPhaseForEvent(event(), '2026-03-21')).toBe('post_event');
    expect(competitionPhaseForEvent(event(), '2026-03-22')).toBe('post_event');
  });

  it('classifies none once outside the preparation window or recovery window', () => {
    expect(competitionPhaseForEvent(event(), '2026-02-01')).toBe('none'); // far in the future, beyond default prep window
    expect(competitionPhaseForEvent(event(), '2026-03-25')).toBe('none'); // well past recovery
  });

  it('respects a custom preparationWindowDays/recoveryWindowDays', () => {
    const custom = event({ preparationWindowDays: 3, recoveryWindowDays: 5 });
    expect(competitionPhaseForEvent(custom, '2026-03-16')).toBe('none'); // 4 days out, beyond the 3-day custom window
    expect(competitionPhaseForEvent(custom, '2026-03-24')).toBe('post_event'); // 4 days after, within the 5-day custom window
  });
});

describe('resolveActiveContext — competition (Q/R/S)', () => {
  it('resolves competition mode with event_day phase on the event date', () => {
    const result = resolveActiveContext('2026-03-20', [], [event()]);
    expect(result.mode).toBe('competition');
    expect(result.competitionPhase).toBe('event_day');
  });

  it('resolves normal (no phase) once fully outside the event\'s configured windows — automatic expiration', () => {
    const result = resolveActiveContext('2026-04-01', [], [event()]);
    expect(result.mode).toBe('normal');
    expect(result.competitionPhase).toBe('none');
  });
});

describe('resolveActiveContext — multiple events (T)', () => {
  it('selects the nearest relevant event when several are stored', () => {
    const near = event({ id: 'near', eventDate: '2026-03-20' });
    const far = event({ id: 'far', eventDate: '2026-06-01' });
    const result = resolveActiveContext('2026-03-19', [], [near, far]);
    expect(result.competition?.id).toBe('near');
  });

  it('handles past, current, and future events independently and deterministically', () => {
    const past = event({ id: 'past', eventDate: '2026-01-01' });
    const current = event({ id: 'current', eventDate: '2026-03-20' });
    const future = event({ id: 'future', eventDate: '2026-12-01' });
    const result = resolveActiveContext('2026-03-20', [], [past, current, future]);
    expect(result.competition?.id).toBe('current');
  });
});

describe('resolveActiveContext — precedence and determinism (invariants)', () => {
  it('competition takes precedence over an overlapping travel window (spec §15)', () => {
    const overlappingTravel = travel({ startDate: '2026-03-15', endDate: '2026-03-25' });
    const result = resolveActiveContext('2026-03-20', [overlappingTravel], [event()]);
    expect(result.mode).toBe('competition');
  });

  it('same inputs always produce the same resolved context (determinism)', () => {
    const a = resolveActiveContext('2026-03-05', [travel()], [event()]);
    const b = resolveActiveContext('2026-03-05', [travel()], [event()]);
    expect(a).toEqual(b);
  });

  it('no travel/competition data at all resolves to normal — a brand-new athlete works unaffected', () => {
    const result = resolveActiveContext('2026-03-05', [], []);
    expect(result).toEqual({ mode: 'normal', travel: null, competition: null, competitionPhase: 'none' });
  });
});
