import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadVersioned, saveVersioned } from './persistence';

/**
 * Persisted store for food preference facts the Nutrition Engine can't derive from
 * logging alone: how many times the athlete has manually replaced each food (by Food
 * Library id), and any explicit liked/disliked tap. Mirrors
 * `ExercisePreferenceContext.tsx`'s exact pattern and versioned-persistence
 * infrastructure — the only new state Nutrition Engine Expansion persists beyond the
 * logs themselves.
 */

const STORAGE_KEY = 'traino.foodPreferences';
const DATA_VERSION = 1;

type ExplicitSignal = 'liked' | 'disliked';

interface Store {
  replacementCounts: Record<string, number>;
  explicitSignals: Record<string, ExplicitSignal>;
}

function isStore(value: unknown): value is Store {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const countsOk =
    typeof v.replacementCounts === 'object' &&
    v.replacementCounts !== null &&
    Object.values(v.replacementCounts as Record<string, unknown>).every((n) => typeof n === 'number' && n >= 0);
  const signalsOk =
    typeof v.explicitSignals === 'object' &&
    v.explicitSignals !== null &&
    Object.values(v.explicitSignals as Record<string, unknown>).every((s) => s === 'liked' || s === 'disliked');
  return countsOk && signalsOk;
}

function loadStore(): Store {
  const result = loadVersioned<Store>({
    storageKey: STORAGE_KEY,
    currentVersion: DATA_VERSION,
    migrations: [],
    validate: isStore,
    fallback: () => ({ replacementCounts: {}, explicitSignals: {} }),
  });
  if (result.usedFallback && result.reason) {
    console.warn(`[FoodPreferenceContext] starting with no food preference history: ${result.reason}`);
  }
  return result.data;
}

interface FoodPreferenceContextValue {
  replacementCounts: Record<string, number>;
  explicitSignals: Record<string, ExplicitSignal>;
  getReplacementCount: (foodId: string) => number;
  recordReplacement: (foodId: string) => void;
  getExplicitSignal: (foodId: string) => ExplicitSignal | undefined;
  /** Toggles: tapping the same signal again clears it back to neutral. */
  setLiked: (foodId: string) => void;
  setDisliked: (foodId: string) => void;
}

const FoodPreferenceContext = createContext<FoodPreferenceContextValue | null>(null);

export function FoodPreferenceProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(loadStore);

  function persist(next: Store) {
    saveVersioned(STORAGE_KEY, DATA_VERSION, next);
    setStore(next);
  }

  function getReplacementCount(foodId: string): number {
    return store.replacementCounts[foodId] ?? 0;
  }

  function recordReplacement(foodId: string): void {
    persist({ ...store, replacementCounts: { ...store.replacementCounts, [foodId]: (store.replacementCounts[foodId] ?? 0) + 1 } });
  }

  function getExplicitSignal(foodId: string): ExplicitSignal | undefined {
    return store.explicitSignals[foodId];
  }

  function setSignal(foodId: string, signal: ExplicitSignal): void {
    const next = { ...store.explicitSignals };
    if (next[foodId] === signal) {
      delete next[foodId];
    } else {
      next[foodId] = signal;
    }
    persist({ ...store, explicitSignals: next });
  }

  function setLiked(foodId: string): void {
    setSignal(foodId, 'liked');
  }

  function setDisliked(foodId: string): void {
    setSignal(foodId, 'disliked');
  }

  const value = useMemo<FoodPreferenceContextValue>(
    () => ({
      replacementCounts: store.replacementCounts,
      explicitSignals: store.explicitSignals,
      getReplacementCount,
      recordReplacement,
      getExplicitSignal,
      setLiked,
      setDisliked,
    }),
    [store]
  );

  return <FoodPreferenceContext.Provider value={value}>{children}</FoodPreferenceContext.Provider>;
}

export function useFoodPreferences(): FoodPreferenceContextValue {
  const ctx = useContext(FoodPreferenceContext);
  if (!ctx) throw new Error('useFoodPreferences must be used within a FoodPreferenceProvider');
  return ctx;
}
