import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ExercisePreferenceProvider, useExercisePreferences } from './ExercisePreferenceContext';

beforeEach(() => {
  localStorage.clear();
});

describe('ExercisePreferenceContext — recordReplacement', () => {
  it('starts at 0 for an exercise with no recorded replacements', () => {
    const { result } = renderHook(() => useExercisePreferences(), { wrapper: ExercisePreferenceProvider });
    expect(result.current.getReplacementCount('back-squat')).toBe(0);
  });

  it('increments the count on each replacement, per exercise id', () => {
    const { result } = renderHook(() => useExercisePreferences(), { wrapper: ExercisePreferenceProvider });
    act(() => result.current.recordReplacement('back-squat'));
    act(() => result.current.recordReplacement('back-squat'));
    act(() => result.current.recordReplacement('bench-press'));
    expect(result.current.getReplacementCount('back-squat')).toBe(2);
    expect(result.current.getReplacementCount('bench-press')).toBe(1);
  });

  it('persists across a fresh provider mount (localStorage-backed)', () => {
    const first = renderHook(() => useExercisePreferences(), { wrapper: ExercisePreferenceProvider });
    act(() => first.result.current.recordReplacement('back-squat'));

    const second = renderHook(() => useExercisePreferences(), { wrapper: ExercisePreferenceProvider });
    expect(second.result.current.getReplacementCount('back-squat')).toBe(1);
  });

  it('starts fresh (fails safe) when localStorage holds corrupt data', () => {
    localStorage.setItem('traino.exercisePreferences', 'not valid json{{{');
    const { result } = renderHook(() => useExercisePreferences(), { wrapper: ExercisePreferenceProvider });
    expect(result.current.getReplacementCount('back-squat')).toBe(0);
  });
});
