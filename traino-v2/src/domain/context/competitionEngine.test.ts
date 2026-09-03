import { describe, expect, it } from 'vitest';
import { daysUntilEvent, findUpcomingEvent, resolveCompetitionDayPlan } from './competitionEngine';
import type { CompetitionEvent } from './types';

/**
 * COMPETITION MODE test matrix (spec §33): O (create event — data shape
 * covered via types/validation), P (upcoming event), Q (event-day
 * behavior), R (post-event recovery), S (automatic expiration — covered
 * jointly with resolveActiveContext.test.ts).
 */

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

describe('resolveCompetitionDayPlan — Q: event-day behavior', () => {
  it('skips the normal session entirely on event day', () => {
    const plan = resolveCompetitionDayPlan('event_day');
    expect(plan.skipNormalSession).toBe(true);
    expect(plan.adjustment).toBeNull();
    expect(plan.message).toMatch(/competition day/i);
  });

  it('never prescribes extreme training, calorie restriction, supplements, or dehydration (spec §10)', () => {
    for (const phase of ['near', 'very_near', 'post_event'] as const) {
      const plan = resolveCompetitionDayPlan(phase);
      expect(plan.adjustment).not.toBeNull();
      // The only levers are volume/high-impact — the same conservative shape every
      // other adjustment source in this app already uses.
      const keys = Object.keys(plan.adjustment!);
      expect(keys.every((k) => ['volumeMultiplier', 'skipHighImpact', 'swapToBodyweight', 'note'].includes(k))).toBe(true);
    }
  });
});

describe('resolveCompetitionDayPlan — taper behavior as competition approaches', () => {
  it('reduces volume modestly when near (within the preparation window)', () => {
    const plan = resolveCompetitionDayPlan('near');
    expect(plan.adjustment?.volumeMultiplier).toBeLessThan(1);
    expect(plan.adjustment?.volumeMultiplier).toBeGreaterThan(0.7);
  });

  it('reduces volume further and removes high-impact movements when very near', () => {
    const plan = resolveCompetitionDayPlan('very_near');
    expect(plan.adjustment?.volumeMultiplier).toBeLessThan(resolveCompetitionDayPlan('near').adjustment!.volumeMultiplier!);
    expect(plan.adjustment?.skipHighImpact).toBe(true);
  });
});

describe('resolveCompetitionDayPlan — R: post-event recovery', () => {
  it('produces a recovery-oriented, conservative adjustment after the event', () => {
    const plan = resolveCompetitionDayPlan('post_event');
    expect(plan.skipNormalSession).toBe(false);
    expect(plan.adjustment?.volumeMultiplier).toBeLessThan(1);
    expect(plan.adjustment?.skipHighImpact).toBe(true);
    expect(plan.message).toMatch(/recovery/i);
  });
});

describe('resolveCompetitionDayPlan — far/none: normal plan applies', () => {
  it('produces no adjustment and no skipped session when far from or unrelated to any event', () => {
    for (const phase of ['far', 'none'] as const) {
      const plan = resolveCompetitionDayPlan(phase);
      expect(plan.skipNormalSession).toBe(false);
      expect(plan.adjustment).toBeNull();
    }
  });
});

describe('daysUntilEvent / findUpcomingEvent — P: upcoming event', () => {
  it('computes a positive day count for a future event', () => {
    expect(daysUntilEvent(event(), '2026-03-15')).toBe(5);
  });

  it('computes zero on event day and negative after it', () => {
    expect(daysUntilEvent(event(), '2026-03-20')).toBe(0);
    expect(daysUntilEvent(event(), '2026-03-22')).toBe(-2);
  });

  it('finds the nearest upcoming event among several, for display purposes, regardless of training-window relevance', () => {
    const near = event({ id: 'near', eventDate: '2026-04-01' });
    const far = event({ id: 'far', eventDate: '2026-08-01' }); // far beyond any taper window
    const upcoming = findUpcomingEvent([near, far], '2026-03-01');
    expect(upcoming?.id).toBe('near');
  });

  it('falls back to the most recent past event when nothing is upcoming', () => {
    const past = event({ id: 'past', eventDate: '2026-01-01' });
    const upcoming = findUpcomingEvent([past], '2026-06-01');
    expect(upcoming?.id).toBe('past');
  });

  it('returns null for an empty event list', () => {
    expect(findUpcomingEvent([], '2026-03-01')).toBeNull();
  });
});
