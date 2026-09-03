import { describe, expect, it } from 'vitest';
import { ContextValidationError, assertValidCompetitionEvent, assertValidTravelContext, findConflictingContext, validateCompetitionEvent, validateTravelContext } from './validation';
import type { CompetitionEvent, TravelContext } from './types';

/** TRAVEL MODE + COMPETITION MODE test matrix (spec §33/§29): validation +
 * U (invalid overlapping events rejected, not silently resolved). */

function travel(overrides: Partial<TravelContext> = {}): TravelContext {
  return {
    id: 't1',
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
    id: 'e1',
    mode: 'competition',
    eventDate: '2026-03-20',
    eventType: 'match',
    createdAt: '2026-02-25T00:00:00.000Z',
    source: 'athlete',
    ...overrides,
  };
}

describe('validateTravelContext', () => {
  it('accepts a well-formed travel context', () => {
    expect(validateTravelContext(travel())).toEqual([]);
  });

  it('rejects an invalid startDate/endDate', () => {
    expect(validateTravelContext(travel({ startDate: 'not-a-date' })).length).toBeGreaterThan(0);
    expect(validateTravelContext(travel({ endDate: '2026-13-40' })).length).toBeGreaterThan(0);
  });

  it('rejects endDate before startDate', () => {
    const violations = validateTravelContext(travel({ startDate: '2026-03-10', endDate: '2026-03-01' }));
    expect(violations.some((v) => v.includes('endDate'))).toBe(true);
  });

  it('rejects an unknown equipment id', () => {
    const violations = validateTravelContext(travel({ constraints: { ...travel().constraints, equipmentIds: ['not_real_equipment'] } }));
    expect(violations.some((v) => v.includes('equipmentIds'))).toBe(true);
  });

  it('rejects an unknown location id', () => {
    const violations = validateTravelContext(travel({ constraints: { ...travel().constraints, locationIds: ['not_a_real_location'] } }));
    expect(violations.some((v) => v.includes('locationIds'))).toBe(true);
  });

  it('rejects a zero/negative/NaN/Infinity time budget', () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      const violations = validateTravelContext(travel({ constraints: { ...travel().constraints, time: { minutesAvailable: bad } } }));
      expect(violations.some((v) => v.includes('minutesAvailable'))).toBe(true);
    }
  });

  it('rejects an out-of-range daysAvailablePerWeek', () => {
    const violations = validateTravelContext(travel({ constraints: { ...travel().constraints, daysAvailablePerWeek: 8 } }));
    expect(violations.some((v) => v.includes('daysAvailablePerWeek'))).toBe(true);
  });

  it('assertValidTravelContext throws ContextValidationError for invalid data', () => {
    expect(() => assertValidTravelContext(travel({ startDate: 'bad' }))).toThrow(ContextValidationError);
  });
});

describe('validateCompetitionEvent', () => {
  it('accepts a well-formed competition event', () => {
    expect(validateCompetitionEvent(event())).toEqual([]);
  });

  it('rejects an invalid eventDate', () => {
    expect(validateCompetitionEvent(event({ eventDate: 'nope' })).length).toBeGreaterThan(0);
  });

  it('rejects an invalid eventTime format', () => {
    expect(validateCompetitionEvent(event({ eventTime: '25:99' })).length).toBeGreaterThan(0);
  });

  it('accepts a valid eventTime', () => {
    expect(validateCompetitionEvent(event({ eventTime: '14:30' }))).toEqual([]);
  });

  it('rejects an invalid eventType', () => {
    expect(validateCompetitionEvent({ ...event(), eventType: 'not_a_type' as CompetitionEvent['eventType'] }).length).toBeGreaterThan(0);
  });

  it('rejects negative preparationWindowDays/recoveryWindowDays', () => {
    expect(validateCompetitionEvent(event({ preparationWindowDays: -1 })).length).toBeGreaterThan(0);
    expect(validateCompetitionEvent(event({ recoveryWindowDays: -1 })).length).toBeGreaterThan(0);
  });

  it('never allows NaN/Infinity through', () => {
    expect(validateCompetitionEvent(event({ preparationWindowDays: NaN })).length).toBeGreaterThan(0);
    expect(validateCompetitionEvent(event({ recoveryWindowDays: Infinity })).length).toBeGreaterThan(0);
  });

  it('assertValidCompetitionEvent throws for invalid data', () => {
    expect(() => assertValidCompetitionEvent(event({ eventDate: 'bad' }))).toThrow(ContextValidationError);
  });
});

describe('findConflictingContext — U: invalid overlapping events rejected, not silently chosen', () => {
  it('rejects two overlapping travel windows', () => {
    const existing = travel({ id: 'existing', startDate: '2026-03-01', endDate: '2026-03-10' });
    const candidate = travel({ id: 'candidate', startDate: '2026-03-05', endDate: '2026-03-15' });
    expect(findConflictingContext(candidate, [existing], [])).not.toBeNull();
  });

  it('allows two non-overlapping travel windows', () => {
    const existing = travel({ id: 'existing', startDate: '2026-03-01', endDate: '2026-03-10' });
    const candidate = travel({ id: 'candidate', startDate: '2026-03-11', endDate: '2026-03-15' });
    expect(findConflictingContext(candidate, [existing], [])).toBeNull();
  });

  it('rejects two competition events on the exact same date', () => {
    const existing = event({ id: 'existing', eventDate: '2026-03-20' });
    const candidate = event({ id: 'candidate', eventDate: '2026-03-20' });
    expect(findConflictingContext(candidate, [], [existing])).not.toBeNull();
  });

  it('allows two competition events on different dates', () => {
    const existing = event({ id: 'existing', eventDate: '2026-03-20' });
    const candidate = event({ id: 'candidate', eventDate: '2026-04-20' });
    expect(findConflictingContext(candidate, [], [existing])).toBeNull();
  });

  it('does not reject a travel window merely overlapping a competition event (supported combination — competition takes precedence)', () => {
    const existingEvent = event({ eventDate: '2026-03-05' });
    const candidateTravel = travel({ startDate: '2026-03-01', endDate: '2026-03-10' });
    expect(findConflictingContext(candidateTravel, [], [existingEvent])).toBeNull();
  });
});
