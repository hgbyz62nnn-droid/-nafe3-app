import type { ExercisePerformanceLog } from '../progression/types';
import type { ExercisePreferenceSignal } from './types';
import { getExerciseByName } from './registry';

/**
 * Deterministic preference/history signal derivation (spec §12/§13) — never a
 * machine-learning system, just fixed thresholds over already-persisted
 * facts (`ExercisePerformanceLog`, from `LogContext.getAllRecords`-style
 * history, and a small replacement-count store — see
 * `domain/state/ExercisePreferenceContext.tsx`). The matching engine only
 * ever reads the resulting signals; safety and training intent always
 * outrank them there, never the other way around.
 *
 * `liked`/`disliked` aren't derived here: nothing in the app persists an
 * explicit like/dislike action, and inventing one would fabricate a signal
 * from data that doesn't exist. The type stays available on
 * `ExercisePreferenceSignal` for if/when such an action is added.
 */

const MIN_EXPOSURES_FOR_COMPLETION_SIGNAL = 3;
const FREQUENTLY_COMPLETED_RATIO_THRESHOLD = 0.9;
const FREQUENTLY_SKIPPED_RATIO_THRESHOLD = 0.5;
const MIN_REPLACEMENTS_FOR_SIGNAL = 3;
const DEFAULT_RECENTLY_USED_LIMIT = 5;

function completionRatio(log: ExercisePerformanceLog): number {
  if (log.prescribedSets <= 0) return 1;
  return Math.min(1, log.completedSets / log.prescribedSets);
}

/** One completion-based signal per logged exercise NAME — 'frequently_completed' or
 * 'frequently_skipped' only once at least MIN_EXPOSURES_FOR_COMPLETION_SIGNAL logged
 * exposures consistently point the same direction; no signal (undefined) when there
 * isn't enough evidence yet, never guessed from a single session. */
function deriveCompletionSignalsByName(logs: ExercisePerformanceLog[]): Map<string, ExercisePreferenceSignal> {
  const byName = new Map<string, ExercisePerformanceLog[]>();
  for (const log of logs) {
    const list = byName.get(log.exerciseName) ?? [];
    list.push(log);
    byName.set(log.exerciseName, list);
  }

  const signals = new Map<string, ExercisePreferenceSignal>();
  for (const [name, entries] of byName) {
    if (entries.length < MIN_EXPOSURES_FOR_COMPLETION_SIGNAL) continue;
    const avgRatio = entries.reduce((sum, e) => sum + completionRatio(e), 0) / entries.length;
    if (avgRatio >= FREQUENTLY_COMPLETED_RATIO_THRESHOLD) signals.set(name, 'frequently_completed');
    else if (avgRatio <= FREQUENTLY_SKIPPED_RATIO_THRESHOLD) signals.set(name, 'frequently_skipped');
  }
  return signals;
}

/**
 * Combines logged-completion evidence with explicit replacement counts into one
 * deterministic preference-signal map, keyed by Exercise Library id (never a raw
 * name) so it composes directly with `ExerciseMatchQuery.preferenceByExerciseId`.
 * An explicit "the athlete keeps swapping this away" signal outranks a
 * completion-ratio signal for the same exercise — being frequently replaced is
 * stronger avoidance evidence than an incidentally low completion ratio.
 */
export function derivePreferenceSignals(logs: ExercisePerformanceLog[], replacementCounts: Record<string, number>): Record<string, ExercisePreferenceSignal> {
  const completionByName = deriveCompletionSignalsByName(logs);
  const result: Record<string, ExercisePreferenceSignal> = {};

  for (const [name, signal] of completionByName) {
    const id = getExerciseByName(name)?.id;
    if (id) result[id] = signal;
  }

  for (const [id, count] of Object.entries(replacementCounts)) {
    if (count >= MIN_REPLACEMENTS_FOR_SIGNAL) result[id] = 'frequently_replaced';
  }

  return result;
}

/** The most recently logged distinct exercises, newest first — feeds the matching
 * engine's small "avoid excessive repetition" ranking nudge (never an exclusion
 * rule, per spec §13). */
export function deriveRecentlyUsedIds(logs: ExercisePerformanceLog[], limit = DEFAULT_RECENTLY_USED_LIMIT): string[] {
  const sorted = [...logs].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const log of sorted) {
    const id = getExerciseByName(log.exerciseName)?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}
