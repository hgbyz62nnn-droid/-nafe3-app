import { describe, expect, it } from 'vitest';
import { derivePreferenceSignals, deriveRecentlyUsedIds } from './preferences';
import { getExerciseByName } from './registry';
import type { ExercisePerformanceLog } from '../progression/types';

function log(name: string, date: string, completedSets: number, prescribedSets = 3): ExercisePerformanceLog {
  return { date, exerciseName: name, prescribedSets, completedSets, wasModified: false, submittedAt: `${date}T10:00:00.000Z` };
}

describe('derivePreferenceSignals', () => {
  it('derives frequently_completed after 3+ consistently full-completion exposures', () => {
    const logs = [log('Back Squat', '2026-01-01', 3), log('Back Squat', '2026-01-08', 3), log('Back Squat', '2026-01-15', 3)];
    const signals = derivePreferenceSignals(logs, {});
    expect(signals[getExerciseByName('Back Squat')!.id]).toBe('frequently_completed');
  });

  it('derives frequently_skipped after 3+ consistently low-completion exposures', () => {
    const logs = [log('Push-Ups', '2026-01-01', 1), log('Push-Ups', '2026-01-08', 0), log('Push-Ups', '2026-01-15', 1)];
    const signals = derivePreferenceSignals(logs, {});
    expect(signals[getExerciseByName('Push-Ups')!.id]).toBe('frequently_skipped');
  });

  it('produces no signal below the minimum exposure count (never guessed from one session)', () => {
    const logs = [log('Bench Press', '2026-01-01', 3), log('Bench Press', '2026-01-08', 3)];
    const signals = derivePreferenceSignals(logs, {});
    expect(signals[getExerciseByName('Bench Press')!.id]).toBeUndefined();
  });

  it('produces no signal for mixed, inconsistent completion (neither threshold met)', () => {
    const logs = [log('Bench Press', '2026-01-01', 3), log('Bench Press', '2026-01-08', 1), log('Bench Press', '2026-01-15', 2)];
    const signals = derivePreferenceSignals(logs, {});
    expect(signals[getExerciseByName('Bench Press')!.id]).toBeUndefined();
  });

  it('frequently_replaced requires the minimum replacement count', () => {
    const id = getExerciseByName('Back Squat')!.id;
    expect(derivePreferenceSignals([], { [id]: 2 })[id]).toBeUndefined();
    expect(derivePreferenceSignals([], { [id]: 3 })[id]).toBe('frequently_replaced');
  });

  it('frequently_replaced outranks a completion signal for the same exercise', () => {
    const id = getExerciseByName('Back Squat')!.id;
    const logs = [log('Back Squat', '2026-01-01', 3), log('Back Squat', '2026-01-08', 3), log('Back Squat', '2026-01-15', 3)];
    const signals = derivePreferenceSignals(logs, { [id]: 3 });
    expect(signals[id]).toBe('frequently_replaced');
  });

  it('never derives liked/disliked signals — nothing in the app persists an explicit like/dislike action', () => {
    const logs = [log('Back Squat', '2026-01-01', 3), log('Back Squat', '2026-01-08', 3), log('Back Squat', '2026-01-15', 3)];
    const signals = derivePreferenceSignals(logs, {});
    expect(Object.values(signals)).not.toContain('liked');
    expect(Object.values(signals)).not.toContain('disliked');
  });

  it('is deterministic — the same logs always produce the same signal map', () => {
    const logs = [log('Back Squat', '2026-01-01', 3), log('Back Squat', '2026-01-08', 3), log('Back Squat', '2026-01-15', 3)];
    expect(derivePreferenceSignals(logs, {})).toEqual(derivePreferenceSignals(logs, {}));
  });
});

describe('deriveRecentlyUsedIds', () => {
  it('returns distinct exercise ids, newest submission first', () => {
    const logs = [log('Back Squat', '2026-01-01', 3), log('Bench Press', '2026-01-02', 3), log('Back Squat', '2026-01-03', 3)];
    const ids = deriveRecentlyUsedIds(logs, 5);
    expect(ids[0]).toBe(getExerciseByName('Back Squat')!.id);
    expect(ids).toHaveLength(2);
  });

  it('respects the limit parameter', () => {
    const logs = [log('Back Squat', '2026-01-01', 3), log('Bench Press', '2026-01-02', 3), log('Push-Ups', '2026-01-03', 3)];
    expect(deriveRecentlyUsedIds(logs, 1)).toHaveLength(1);
  });

  it('returns [] for no logged history', () => {
    expect(deriveRecentlyUsedIds([])).toEqual([]);
  });
});
