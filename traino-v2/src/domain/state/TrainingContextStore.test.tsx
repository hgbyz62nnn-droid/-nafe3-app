import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TrainingContextProvider, useTrainingContext } from './TrainingContextStore';

/** TRAVEL MODE + COMPETITION MODE test matrix (spec §33): A/B (start/end
 * travel), T/U (multiple events, invalid overlap rejected), AE
 * (persistence/reload), I (equipment restoration after travel ends). */

beforeEach(() => {
  localStorage.clear();
});

function travelInput(overrides: Partial<Parameters<ReturnType<typeof useTrainingContext>['addTravelContext']>[0]> = {}) {
  return {
    startDate: '2026-03-01',
    endDate: '2026-03-10',
    constraints: { equipmentIds: [], locationIds: ['home'], time: { minutesAvailable: 30 }, affectsNutrition: false },
    source: 'athlete' as const,
    ...overrides,
  };
}

function eventInput(overrides: Partial<Parameters<ReturnType<typeof useTrainingContext>['addCompetitionEvent']>[0]> = {}) {
  return {
    eventDate: '2026-04-01',
    eventType: 'match' as const,
    source: 'athlete' as const,
    ...overrides,
  };
}

describe('TrainingContextStore — A: start Travel Mode', () => {
  it('adds a real, validated travel context', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    act(() => {
      result.current.addTravelContext(travelInput());
    });
    expect(result.current.travelContexts).toHaveLength(1);
    expect(result.current.travelContexts[0].startDate).toBe('2026-03-01');
  });

  it('rejects an invalid travel context (validation error) without adding it', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    act(() => {
      expect(() => result.current.addTravelContext(travelInput({ startDate: 'bad-date' }))).toThrow();
    });
    expect(result.current.travelContexts).toHaveLength(0);
  });
});

describe('TrainingContextStore — B: end Travel Mode / I: equipment restoration', () => {
  it('cancelTravelContext on an already-started window caps endDate to yesterday, restoring the base plan from today onward, without deleting the days already traveled', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    let id = '';
    act(() => {
      id = result.current.addTravelContext(travelInput({ startDate: '2026-03-01', endDate: '2026-03-10' })).id;
    });
    act(() => {
      result.current.cancelTravelContext(id, '2026-03-05');
    });
    expect(result.current.travelContexts).toHaveLength(1);
    // Ends as of yesterday relative to the cancellation date — the days
    // 2026-03-01..2026-03-04 remain part of the audited travel window,
    // but today (2026-03-05) is no longer inside it.
    expect(result.current.travelContexts[0].endDate).toBe('2026-03-04');
    expect(result.current.getResolvedContext('2026-03-05').mode).toBe('normal');
    expect(result.current.getResolvedContext('2026-03-04').mode).toBe('travel');
  });

  it('cancelTravelContext on a window starting today removes it outright (ending immediately, nothing to audit going forward)', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    let id = '';
    act(() => {
      id = result.current.addTravelContext(travelInput({ startDate: '2026-03-05', endDate: '2026-03-10' })).id;
    });
    act(() => {
      result.current.cancelTravelContext(id, '2026-03-05');
    });
    expect(result.current.travelContexts).toHaveLength(0);
    expect(result.current.getResolvedContext('2026-03-05').mode).toBe('normal');
  });

  it('cancelTravelContext on a not-yet-started window removes it outright (nothing happened, nothing to audit)', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    let id = '';
    act(() => {
      id = result.current.addTravelContext(travelInput({ startDate: '2026-06-01', endDate: '2026-06-10' })).id;
    });
    act(() => {
      result.current.cancelTravelContext(id, '2026-03-01');
    });
    expect(result.current.travelContexts).toHaveLength(0);
  });

  it('after Travel Mode ends, resolving a date past its window returns to normal — equipment/location restored automatically', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    act(() => {
      result.current.addTravelContext(travelInput({ startDate: '2026-03-01', endDate: '2026-03-05' }));
    });
    expect(result.current.getResolvedContext('2026-03-03').mode).toBe('travel');
    expect(result.current.getResolvedContext('2026-03-06').mode).toBe('normal');
  });
});

describe('TrainingContextStore — T: multiple competition events', () => {
  it('supports several independently-identifiable events', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    act(() => {
      result.current.addCompetitionEvent(eventInput({ eventDate: '2026-04-01' }));
      result.current.addCompetitionEvent(eventInput({ eventDate: '2026-05-01' }));
    });
    expect(result.current.competitionEvents).toHaveLength(2);
  });

  it('removeCompetitionEvent removes only the targeted event', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    let firstId = '';
    act(() => {
      firstId = result.current.addCompetitionEvent(eventInput({ eventDate: '2026-04-01' })).id;
      result.current.addCompetitionEvent(eventInput({ eventDate: '2026-05-01' }));
    });
    act(() => {
      result.current.removeCompetitionEvent(firstId);
    });
    expect(result.current.competitionEvents).toHaveLength(1);
    expect(result.current.competitionEvents[0].eventDate).toBe('2026-05-01');
  });
});

describe('TrainingContextStore — U: invalid overlapping context rejected, not silently chosen', () => {
  it('rejects a second travel context overlapping an existing one', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    act(() => {
      result.current.addTravelContext(travelInput({ startDate: '2026-03-01', endDate: '2026-03-10' }));
    });
    act(() => {
      expect(() => result.current.addTravelContext(travelInput({ startDate: '2026-03-05', endDate: '2026-03-15' }))).toThrow();
    });
    expect(result.current.travelContexts).toHaveLength(1);
  });

  it('rejects a second competition event on the exact same date', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    act(() => {
      result.current.addCompetitionEvent(eventInput({ eventDate: '2026-04-01' }));
    });
    act(() => {
      expect(() => result.current.addCompetitionEvent(eventInput({ eventDate: '2026-04-01' }))).toThrow();
    });
    expect(result.current.competitionEvents).toHaveLength(1);
  });
});

describe('TrainingContextStore — AE: persistence/reload', () => {
  it('persists travel contexts and competition events across a remount', () => {
    const first = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    act(() => {
      first.result.current.addTravelContext(travelInput());
      first.result.current.addCompetitionEvent(eventInput());
    });
    const second = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    expect(second.result.current.travelContexts).toHaveLength(1);
    expect(second.result.current.competitionEvents).toHaveLength(1);
  });

  it('a brand-new athlete with no stored context data resolves to normal, never throwing', () => {
    const { result } = renderHook(() => useTrainingContext(), { wrapper: TrainingContextProvider });
    expect(result.current.travelContexts).toEqual([]);
    expect(result.current.competitionEvents).toEqual([]);
    expect(result.current.getResolvedContext('2026-03-01').mode).toBe('normal');
  });
});
