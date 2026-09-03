import { LEGACY_ALTERNATIVES_BY_NAME } from '../exercise/legacyAlternatives';

/**
 * Deterministic exercise-replacement table for the "Replace an exercise"
 * flow: each entry lists pre-authored alternatives that target the same
 * movement pattern/muscle group. A fixed lookup, not a generated swap.
 *
 * Thin compatibility wrapper: `domain/exercise/legacyAlternatives.ts` is now
 * the single source of truth for this data (also read by the Exercise
 * Library derivation) — this file exists only so existing callers
 * (TodaysWorkout.tsx and tests) don't need to change their import path.
 * New code should prefer the Exercise Intelligence matching engine
 * (`domain/exercise/matchingEngine.ts`), which is safety/equipment/intent
 * aware; this table has none of that.
 */
export interface AlternativeExercise {
  name: string;
  reps: string;
}

export function getExerciseAlternatives(name: string): AlternativeExercise[] {
  return LEGACY_ALTERNATIVES_BY_NAME[name] ?? [];
}
