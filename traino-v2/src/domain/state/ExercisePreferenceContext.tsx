import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadVersioned, saveVersioned } from './persistence';

/**
 * Persisted store for one small deterministic fact: how many times the
 * athlete has manually replaced each exercise (by Exercise Library id) via
 * the Replace Exercise flow. Uses the exact same versioned load/save
 * infrastructure every other store already uses (`domain/state/persistence.ts`).
 *
 * This is the ONLY new piece of state Exercise Intelligence persists — no
 * like/dislike UI exists anywhere in the app, so those preference signals
 * are never derived rather than fabricated (see `domain/exercise/preferences.ts`).
 * Replacement counts feed `derivePreferenceSignals` to produce the
 * 'frequently_replaced' ranking signal the matching engine consumes.
 */

const STORAGE_KEY = 'traino.exercisePreferences';
const DATA_VERSION = 1;

type Store = Record<string, number>;

function isStore(value: unknown): value is Store {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'number' && v >= 0);
}

function loadStore(): Store {
  const result = loadVersioned<Store>({
    storageKey: STORAGE_KEY,
    currentVersion: DATA_VERSION,
    migrations: [],
    validate: isStore,
    fallback: () => ({}),
  });
  if (result.usedFallback && result.reason) {
    console.warn(`[ExercisePreferenceContext] starting with no replacement history: ${result.reason}`);
  }
  return result.data;
}

interface ExercisePreferenceContextValue {
  replacementCounts: Store;
  getReplacementCount: (exerciseId: string) => number;
  /** Records one manual replacement-away-from event for `exerciseId` (the exercise
   * being replaced, not the one it's replaced with). */
  recordReplacement: (exerciseId: string) => void;
}

const ExercisePreferenceContext = createContext<ExercisePreferenceContextValue | null>(null);

export function ExercisePreferenceProvider({ children }: { children: ReactNode }) {
  const [replacementCounts, setReplacementCounts] = useState<Store>(loadStore);

  function getReplacementCount(exerciseId: string): number {
    return replacementCounts[exerciseId] ?? 0;
  }

  function recordReplacement(exerciseId: string): void {
    setReplacementCounts((prev) => {
      const next = { ...prev, [exerciseId]: (prev[exerciseId] ?? 0) + 1 };
      saveVersioned(STORAGE_KEY, DATA_VERSION, next);
      return next;
    });
  }

  const value = useMemo<ExercisePreferenceContextValue>(
    () => ({ replacementCounts, getReplacementCount, recordReplacement }),
    [replacementCounts]
  );

  return <ExercisePreferenceContext.Provider value={value}>{children}</ExercisePreferenceContext.Provider>;
}

export function useExercisePreferences(): ExercisePreferenceContextValue {
  const ctx = useContext(ExercisePreferenceContext);
  if (!ctx) throw new Error('useExercisePreferences must be used within an ExercisePreferenceProvider');
  return ctx;
}
