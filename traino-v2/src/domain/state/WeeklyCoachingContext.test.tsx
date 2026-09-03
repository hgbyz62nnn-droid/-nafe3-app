import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { WeeklyCoachingProvider, useWeeklyCoaching } from './WeeklyCoachingContext';
import type { CoachingDecision } from '../coaching/types';

beforeEach(() => {
  localStorage.clear();
});

function decision(overrides: Partial<CoachingDecision> = {}): CoachingDecision {
  return {
    barrier: 'time',
    severity: 'high',
    evidence: 'test evidence',
    confidence: 'high',
    recommendedAction: 'REDUCE_SESSION_DURATION',
    affectedPlanArea: 'training',
    proposedChanges: { trainingAdjustment: { volumeMultiplier: 0.65, note: 'test' }, summary: '60 min -> 40 min' },
    reason: 'test reason',
    requiresApproval: true,
    isRecurring: false,
    recurringWeeks: 0,
    ...overrides,
  };
}

describe('WeeklyCoachingContext — saveReview / approve / reject', () => {
  it('saveReview creates a pending record when the decision requires approval', () => {
    const { result } = renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider });
    act(() => result.current.saveReview(1, '2026-01-05', null, decision()));
    const record = result.current.getRecord(1);
    expect(record?.approvalStatus).toBe('pending');
    expect(record?.appliesFromPlanWeek).toBe(2);
  });

  it('saveReview marks a decision that does not require approval as not_applicable', () => {
    const { result } = renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider });
    act(() => result.current.saveReview(1, '2026-01-05', null, decision({ requiresApproval: false, proposedChanges: null })));
    expect(result.current.getRecord(1)?.approvalStatus).toBe('not_applicable');
  });

  it('J: rejecting a recommendation leaves no approved adjustment for the next week', () => {
    const { result } = renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider });
    act(() => result.current.saveReview(1, '2026-01-05', null, decision()));
    act(() => result.current.reject(1));
    expect(result.current.getRecord(1)?.approvalStatus).toBe('rejected');
    expect(result.current.getApprovedAdjustmentForWeek(2)).toBeNull();
  });

  it('K: approving a recommendation makes it available as the approved adjustment for next week only', () => {
    const { result } = renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider });
    act(() => result.current.saveReview(1, '2026-01-05', null, decision()));
    act(() => result.current.approve(1));
    expect(result.current.getRecord(1)?.approvalStatus).toBe('approved');
    expect(result.current.getApprovedAdjustmentForWeek(2)?.decision?.proposedChanges?.summary).toBe('60 min -> 40 min');
    expect(result.current.getApprovedAdjustmentForWeek(1)).toBeNull();
    expect(result.current.getApprovedAdjustmentForWeek(3)).toBeNull();
  });

  it('approving one week never mutates a different, already-recorded week (historical immutability)', () => {
    const { result } = renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider });
    act(() => {
      result.current.saveReview(1, '2026-01-05', null, decision({ barrier: 'time' }));
      result.current.saveReview(2, '2026-01-12', null, decision({ barrier: 'fatigue' }));
    });
    act(() => result.current.approve(2));
    expect(result.current.getRecord(1)?.approvalStatus).toBe('pending');
    expect(result.current.getRecord(1)?.decision?.barrier).toBe('time');
    expect(result.current.getRecord(2)?.approvalStatus).toBe('approved');
  });

  it('getHistoryBefore returns only strictly earlier weeks, oldest first', () => {
    const { result } = renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider });
    act(() => {
      result.current.saveReview(3, '2026-01-19', null, decision());
      result.current.saveReview(1, '2026-01-05', null, decision());
      result.current.saveReview(2, '2026-01-12', null, decision());
    });
    const history = result.current.getHistoryBefore(3);
    expect(history.map((r) => r.reviewedPlanWeek)).toEqual([1, 2]);
  });

  it('getLatestRecord returns the most recently reviewed week', () => {
    const { result } = renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider });
    expect(result.current.getLatestRecord()).toBeNull();
    act(() => {
      result.current.saveReview(1, '2026-01-05', null, decision());
      result.current.saveReview(3, '2026-01-19', null, decision({ barrier: 'travel' }));
      result.current.saveReview(2, '2026-01-12', null, decision());
    });
    expect(result.current.getLatestRecord()?.reviewedPlanWeek).toBe(3);
    expect(result.current.getLatestRecord()?.decision?.barrier).toBe('travel');
  });
});

describe('WeeklyCoachingContext — persistence (M)', () => {
  it('survives a full remount, including approval status', () => {
    const first = renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider });
    act(() => {
      first.result.current.saveReview(1, '2026-01-05', { barrierIds: ['time'], submittedAt: '2026-01-05' }, decision());
      first.result.current.approve(1);
    });

    const second = renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider });
    const record = second.result.current.getRecord(1);
    expect(record?.approvalStatus).toBe('approved');
    expect(record?.checkIn?.barrierIds).toEqual(['time']);
    expect(record?.decision?.barrier).toBe('time');
    expect(second.result.current.getApprovedAdjustmentForWeek(2)).not.toBeNull();
  });

  it('starts empty on corrupt storage rather than throwing', () => {
    localStorage.setItem('traino.weeklyCoaching', '{not valid json');
    expect(() => renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider })).not.toThrow();
    const { result } = renderHook(() => useWeeklyCoaching(), { wrapper: WeeklyCoachingProvider });
    expect(result.current.records).toEqual({});
  });
});
