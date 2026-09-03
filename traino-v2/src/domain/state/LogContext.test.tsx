import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LogProvider, useLogs } from './LogContext';
import { localDateKey } from '../engine/dateUtils';

beforeEach(() => {
  localStorage.clear();
});

describe('LogContext — logging', () => {
  it('a day with no activity reads back as an honest empty log, not undefined', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    const day = result.current.getDayLog('2026-01-01');
    expect(day).toEqual({ date: '2026-01-01', loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false });
  });

  it('toggleMealLogged adds then removes a slot', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() => result.current.toggleMealLogged('2026-01-01', 'breakfast'));
    expect(result.current.getDayLog('2026-01-01').loggedMealSlots).toEqual(['breakfast']);
    act(() => result.current.toggleMealLogged('2026-01-01', 'breakfast'));
    expect(result.current.getDayLog('2026-01-01').loggedMealSlots).toEqual([]);
  });

  it('setWorkoutCompleted records the workout name and statCategory only when completing, and keeps them on un-completing', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() => result.current.setWorkoutCompleted('2026-01-01', true, 'Speed + Lower Body', 'speed'));
    expect(result.current.getDayLog('2026-01-01')).toMatchObject({
      workoutCompleted: true,
      workoutName: 'Speed + Lower Body',
      statCategory: 'speed',
    });
    act(() => result.current.setWorkoutCompleted('2026-01-01', false));
    const day = result.current.getDayLog('2026-01-01');
    expect(day.workoutCompleted).toBe(false);
    expect(day.workoutName).toBe('Speed + Lower Body'); // history preserved, not wiped
  });

  it('persists logs across a remount', () => {
    const first = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() => first.result.current.setWorkoutCompleted('2026-01-02', true, 'Test', 'strength'));

    const second = renderHook(() => useLogs(), { wrapper: LogProvider });
    expect(second.result.current.getDayLog('2026-01-02').workoutCompleted).toBe(true);
  });
});

describe('LogContext — regression: date/time log mismatch', () => {
  it('`today` is keyed by local calendar date, matching localDateKey exactly', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    expect(result.current.today).toBe(localDateKey(new Date()));
  });
});

describe('LogContext — regression: state write race', () => {
  it('two rapid sequential updates to different fields on the same day both land (no lost update)', () => {
    // The old implementation closed over a stale `logs` snapshot in `updateDay`,
    // so two updates fired in the same tick could clobber each other. The fix
    // uses a functional `setLogs(prev => ...)` update — assert both writes survive.
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() => {
      result.current.toggleMealLogged('2026-01-03', 'breakfast');
      result.current.toggleMealLogged('2026-01-03', 'lunch');
    });
    const day = result.current.getDayLog('2026-01-03');
    expect(day.loggedMealSlots).toEqual(expect.arrayContaining(['breakfast', 'lunch']));
    expect(day.loggedMealSlots).toHaveLength(2);
  });

  it('an update to one day never clobbers a concurrently-updated different day', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() => {
      result.current.setWorkoutCompleted('2026-01-04', true, 'Day A', 'strength');
      result.current.setWorkoutCompleted('2026-01-05', true, 'Day B', 'speed');
    });
    expect(result.current.getDayLog('2026-01-04').workoutCompleted).toBe(true);
    expect(result.current.getDayLog('2026-01-05').workoutCompleted).toBe(true);
  });
});

describe('LogContext — regression: weight logging validation', () => {
  it('rejects a NaN/negative/absurd weight rather than corrupting the trend history', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() => result.current.logWeight('2026-01-06', NaN));
    expect(result.current.getDayLog('2026-01-06').weightKg).toBeUndefined();
    act(() => result.current.logWeight('2026-01-06', -10));
    expect(result.current.getDayLog('2026-01-06').weightKg).toBeUndefined();
    act(() => result.current.logWeight('2026-01-06', 82.4));
    expect(result.current.getDayLog('2026-01-06').weightKg).toBe(82.4);
  });
});

describe('LogContext — logExercisePerformance / getExerciseHistory', () => {
  it('records one exercise log and returns it via getExerciseHistory', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() =>
      result.current.logExercisePerformance('2026-02-01', {
        exerciseName: 'Back Squat',
        prescribedSets: 3,
        completedSets: 3,
        repsAchieved: 8,
        loadKg: 70,
        rir: 2,
        wasModified: false,
      })
    );
    const history = result.current.getExerciseHistory('Back Squat');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ date: '2026-02-01', exerciseName: 'Back Squat', loadKg: 70, rir: 2 });
  });

  it('resubmitting the same exercise on the same date replaces, not duplicates (idempotent)', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() => {
      result.current.logExercisePerformance('2026-02-01', {
        exerciseName: 'Back Squat', prescribedSets: 3, completedSets: 3, repsAchieved: 6, loadKg: 70, wasModified: false,
      });
      result.current.logExercisePerformance('2026-02-01', {
        exerciseName: 'Back Squat', prescribedSets: 3, completedSets: 3, repsAchieved: 8, loadKg: 72.5, wasModified: false,
      });
    });
    const history = result.current.getExerciseHistory('Back Squat');
    expect(history).toHaveLength(1);
    expect(history[0].repsAchieved).toBe(8);
    expect(history[0].loadKg).toBe(72.5);
  });

  it('a different exercise the same day, and the same exercise on a different day, are separate entries', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() => {
      result.current.logExercisePerformance('2026-02-01', { exerciseName: 'Back Squat', prescribedSets: 3, completedSets: 3, wasModified: false });
      result.current.logExercisePerformance('2026-02-01', { exerciseName: 'Bench Press', prescribedSets: 3, completedSets: 3, wasModified: false });
      result.current.logExercisePerformance('2026-02-02', { exerciseName: 'Back Squat', prescribedSets: 3, completedSets: 3, wasModified: false });
    });
    expect(result.current.getExerciseHistory('Back Squat')).toHaveLength(2);
    expect(result.current.getExerciseHistory('Bench Press')).toHaveLength(1);
  });

  it('getExerciseHistory returns oldest first and never invents entries for unlogged days', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() => {
      result.current.logExercisePerformance('2026-02-03', { exerciseName: 'Back Squat', prescribedSets: 3, completedSets: 3, wasModified: false });
      result.current.logExercisePerformance('2026-02-01', { exerciseName: 'Back Squat', prescribedSets: 3, completedSets: 3, wasModified: false });
    });
    const history = result.current.getExerciseHistory('Back Squat');
    expect(history.map((h) => h.date)).toEqual(['2026-02-01', '2026-02-03']);
    expect(result.current.getExerciseHistory('Never Logged')).toEqual([]);
  });

  it('sanitizes a corrupted log (NaN/negative/out-of-range) before persisting rather than storing garbage', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() =>
      result.current.logExercisePerformance('2026-02-01', {
        exerciseName: 'Back Squat',
        prescribedSets: NaN as unknown as number,
        completedSets: -5 as number,
        loadKg: -10,
        rir: 99,
        wasModified: false,
      })
    );
    const [entry] = result.current.getExerciseHistory('Back Squat');
    expect(Number.isNaN(entry.prescribedSets)).toBe(false);
    expect(entry.completedSets).toBeGreaterThanOrEqual(0);
    expect(entry.loadKg).toBeUndefined();
    expect(entry.rir).toBeUndefined();
  });

  it('persists exercise logs across a remount', () => {
    const first = renderHook(() => useLogs(), { wrapper: LogProvider });
    act(() =>
      first.result.current.logExercisePerformance('2026-02-01', {
        exerciseName: 'Back Squat', prescribedSets: 3, completedSets: 3, repsAchieved: 8, loadKg: 70, wasModified: false,
      })
    );
    const second = renderHook(() => useLogs(), { wrapper: LogProvider });
    expect(second.result.current.getExerciseHistory('Back Squat')).toHaveLength(1);
  });
});

describe('LogContext — getLogsSince (calendar-aware progression input)', () => {
  it('returns one entry per calendar day from the start date through today, inclusive', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    const today = new Date();
    const sixDaysAgo = localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));
    const logs = result.current.getLogsSince(sixDaysAgo);
    expect(logs).toHaveLength(7);
    expect(logs[0].date).toBe(sixDaysAgo);
    expect(logs[logs.length - 1].date).toBe(result.current.today);
  });

  it('returns an empty array for a malformed start date rather than throwing', () => {
    const { result } = renderHook(() => useLogs(), { wrapper: LogProvider });
    expect(() => result.current.getLogsSince('not-a-date')).not.toThrow();
    expect(result.current.getLogsSince('not-a-date')).toEqual([]);
  });
});
