import type { FoodPreferenceSignal, NutritionLogEntry } from './types';
import { getFoodByName } from './registry';

/**
 * Deterministic food preference/history signal derivation (spec §17/§18/§20) —
 * fixed thresholds over already-persisted facts (`NutritionLogEntry`, and a small
 * replacement-count store — see `domain/state/FoodPreferenceContext.tsx`). The
 * matching/meal-builder engines only ever read the resulting signals; allergy and
 * dietary-pattern safety always outrank them there, never the other way around.
 *
 * 'liked'/'disliked' aren't derived from logging quantity — nothing in the app
 * infers "like" from "ate it" (an athlete eats plenty of food they're neutral on).
 * They come from the SAME small persisted store as replacement counts: an explicit
 * "like"/"dislike" tap surfaces here as those signals when present; frequent
 * logging/replacement are separate, log-derived signals.
 */

const MIN_LOGS_FOR_FREQUENTLY_LOGGED = 3;
const MIN_REPLACEMENTS_FOR_SIGNAL = 3;
const DEFAULT_RECENTLY_USED_LIMIT = 5;

/** Foods logged at least MIN_LOGS_FOR_FREQUENTLY_LOGGED times — a positive, ranking-only
 * signal (spec §22 "frequently completed"-style evidence), never a hard requirement. */
function deriveFrequentlyLoggedByFoodId(logs: NutritionLogEntry[]): Set<string> {
  const counts = new Map<string, number>();
  for (const log of logs) {
    counts.set(log.foodId, (counts.get(log.foodId) ?? 0) + 1);
  }
  const frequent = new Set<string>();
  for (const [foodId, count] of counts) {
    if (count >= MIN_LOGS_FOR_FREQUENTLY_LOGGED) frequent.add(foodId);
  }
  return frequent;
}

/**
 * Combines real logged-frequency evidence with explicit replacement counts and any
 * explicit liked/disliked taps into one deterministic signal map, keyed by Food
 * Library id. An explicit dislike/frequent-replacement outranks a frequently-logged
 * signal for the same food — being swapped away from repeatedly is stronger
 * avoidance evidence than incidental logging frequency.
 */
export function deriveFoodPreferenceSignals(
  logs: NutritionLogEntry[],
  replacementCounts: Record<string, number>,
  explicitSignals: Record<string, 'liked' | 'disliked'> = {}
): Record<string, FoodPreferenceSignal> {
  const result: Record<string, FoodPreferenceSignal> = {};

  for (const foodId of deriveFrequentlyLoggedByFoodId(logs)) {
    result[foodId] = 'frequently_logged';
  }

  for (const [foodId, count] of Object.entries(replacementCounts)) {
    if (count >= MIN_REPLACEMENTS_FOR_SIGNAL) result[foodId] = 'frequently_replaced';
  }

  for (const [foodId, signal] of Object.entries(explicitSignals)) {
    result[foodId] = signal;
  }

  return result;
}

/** The most recently logged distinct foods, newest first — feeds the Meal
 * Builder/matching engine's "avoid repetition" ranking nudge (never an exclusion). */
export function deriveRecentlyUsedFoodIds(logs: NutritionLogEntry[], limit = DEFAULT_RECENTLY_USED_LIMIT): string[] {
  const sorted = [...logs].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const log of sorted) {
    if (seen.has(log.foodId)) continue;
    seen.add(log.foodId);
    ids.push(log.foodId);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** Resolves a legacy free-text disliked/liked food name (if ever entered as text)
 * to a real Food Library id — never fabricates an id for a name that isn't a real
 * food; the caller decides how to handle an unresolved name (e.g. ignore it). */
export function resolveFoodPreferenceName(name: string): string | undefined {
  return getFoodByName(name)?.id;
}
