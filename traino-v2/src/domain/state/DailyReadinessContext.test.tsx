import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DailyReadinessProvider, useDailyReadiness } from './DailyReadinessContext';
import type { DailyReadinessInputs } from '../readiness/types';

beforeEach(() => {
  localStorage.clear();
});

function inputs(overrides: Partial<DailyReadinessInputs> = {}): DailyReadinessInputs {
  return {
    sleepQuality: 3,
    sleepDurationBucket: 3,
    energy: 3,
    stress: 3,
    soreness: 3,
    motivation: 3,
    painFlag: false,
    ...overrides,
  };
}

describe('DailyReadinessContext — submitCheckIn', () => {
  it('O: creates a record for the given date with the engine-computed score/status', () => {
    const { result } = renderHook(() => useDailyReadiness(), { wrapper: DailyReadinessProvider });
    act(() => result.current.submitCheckIn(inputs(), '2026-02-01'));
    const record = result.current.getRecord('2026-02-01');
    expect(record?.date).toBe('2026-02-01');
    expect(record?.score).toBe(50);
    expect(record?.status).toBe('normal');
  });

  it('P: resubmitting the same date overwrites (idempotent upsert), not a second record', () => {
    const { result } = renderHook(() => useDailyReadiness(), { wrapper: DailyReadinessProvider });
    act(() => result.current.submitCheckIn(inputs({ energy: 1 }), '2026-02-01'));
    act(() => result.current.submitCheckIn(inputs({ energy: 5 }), '2026-02-01'));
    expect(result.current.getAllRecords()).toHaveLength(1);
    expect(result.current.getRecord('2026-02-01')?.inputs.energy).toBe(5);
  });

  it('Q: a new date always creates a new record, never mutating a prior date', () => {
    const { result } = renderHook(() => useDailyReadiness(), { wrapper: DailyReadinessProvider });
    act(() => {
      result.current.submitCheckIn(inputs({ energy: 1 }), '2026-02-01');
      result.current.submitCheckIn(inputs({ energy: 5 }), '2026-02-02');
    });
    expect(result.current.getRecord('2026-02-01')?.inputs.energy).toBe(1);
    expect(result.current.getRecord('2026-02-02')?.inputs.energy).toBe(5);
    expect(result.current.getAllRecords()).toHaveLength(2);
  });

  it('sanitizes corrupted inputs before scoring rather than persisting NaN', () => {
    const { result } = renderHook(() => useDailyReadiness(), { wrapper: DailyReadinessProvider });
    act(() =>
      result.current.submitCheckIn({ ...inputs(), sleepQuality: NaN as unknown as 1 }, '2026-02-01')
    );
    const record = result.current.getRecord('2026-02-01');
    expect(Number.isNaN(record?.score)).toBe(false);
    expect(record?.inputs.sleepQuality).toBe(3);
  });

  it('getHistoryBefore returns only strictly earlier dates, oldest first', () => {
    const { result } = renderHook(() => useDailyReadiness(), { wrapper: DailyReadinessProvider });
    act(() => {
      result.current.submitCheckIn(inputs(), '2026-02-03');
      result.current.submitCheckIn(inputs(), '2026-02-01');
      result.current.submitCheckIn(inputs(), '2026-02-02');
    });
    const history = result.current.getHistoryBefore('2026-02-03');
    expect(history.map((r) => r.date)).toEqual(['2026-02-01', '2026-02-02']);
  });

  it('getLatestRecord returns the most recently dated record', () => {
    const { result } = renderHook(() => useDailyReadiness(), { wrapper: DailyReadinessProvider });
    expect(result.current.getLatestRecord()).toBeNull();
    act(() => {
      result.current.submitCheckIn(inputs(), '2026-02-01');
      result.current.submitCheckIn(inputs({ energy: 5 }), '2026-02-03');
      result.current.submitCheckIn(inputs(), '2026-02-02');
    });
    expect(result.current.getLatestRecord()?.date).toBe('2026-02-03');
    expect(result.current.getLatestRecord()?.inputs.energy).toBe(5);
  });
});

describe('DailyReadinessContext — persistence', () => {
  it('R: survives a full remount, including the computed score/status/recommendation', () => {
    const first = renderHook(() => useDailyReadiness(), { wrapper: DailyReadinessProvider });
    act(() => first.result.current.submitCheckIn(inputs({ energy: 1, sleepQuality: 1 }), '2026-02-01'));

    const second = renderHook(() => useDailyReadiness(), { wrapper: DailyReadinessProvider });
    const record = second.result.current.getRecord('2026-02-01');
    expect(record).toBeDefined();
    expect(record?.status).toBeDefined();
    expect(record?.recommendation.message.length).toBeGreaterThan(0);
  });

  it('starts empty on corrupt storage rather than throwing', () => {
    localStorage.setItem('traino.readiness', '{not valid json');
    expect(() => renderHook(() => useDailyReadiness(), { wrapper: DailyReadinessProvider })).not.toThrow();
    const { result } = renderHook(() => useDailyReadiness(), { wrapper: DailyReadinessProvider });
    expect(result.current.records).toEqual({});
  });
});
