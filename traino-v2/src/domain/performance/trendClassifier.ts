import type { TrendResult, TrendState, TrendConfidence } from './types';

/**
 * The ONE deterministic Trend Engine (spec §4) — reused for exercise
 * performance, nutrition adherence, readiness/sleep/energy/soreness/stress,
 * and body weight, so "improving/stable/declining" always means the same
 * thing everywhere (spec §25/§36: avoid conflicting definitions of progress).
 *
 * Pure arithmetic over a caller-supplied numeric series, oldest first. Never
 * reads dates, exercise names, or sport — this file has zero domain
 * knowledge, which is what keeps it free of any `sport ===`/exercise-name
 * branching by construction.
 */

/** A single point never creates a trend (spec §31 invariant #2) — at least
 * two comparable values are required before any direction is claimed. */
export const MIN_POINTS_FOR_TREND = 2;
/** At or above this many comparable points, a trend is reported with
 * `sufficient` confidence rather than `limited` (spec §15). */
export const MIN_POINTS_FOR_SUFFICIENT_CONFIDENCE = 4;
/** How many of the most recent points the trend is computed from — bounds
 * how far back "recent" reaches, so ancient history never dominates. */
export const TREND_WINDOW_SIZE = 6;
/** A change smaller than this fraction of the earlier average counts as
 * "stable" rather than a direction — absorbs float noise and small
 * fluctuations without needing to delete any data point (spec §16). */
export const STABLE_TOLERANCE_PCT = 0.02;

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface ClassifyTrendOptions {
  /** False for factors where a LOWER value is the good direction (stress,
   * soreness) — flips "improving"/"declining" without changing the underlying
   * arithmetic. Defaults to true. */
  higherIsBetter?: boolean;
}

/**
 * Classifies a trend from a series of comparable numeric values, oldest
 * first. Splits the trailing window into an earlier half and a later half
 * and compares their averages — a deliberate choice over comparing only the
 * two endpoint values, so a single unusually high/low session can't by
 * itself flip the reported direction (spec §16: outlier protection without
 * deleting data).
 *
 * Every non-finite value is dropped before classification (spec §27: never
 * let malformed historical data produce NaN/Infinity here).
 */
export function classifyTrend(rawSeries: number[], options: ClassifyTrendOptions = {}): TrendResult {
  const higherIsBetter = options.higherIsBetter ?? true;
  const series = rawSeries.filter((v) => Number.isFinite(v));

  if (series.length < MIN_POINTS_FOR_TREND) {
    return { state: 'insufficient_data', confidence: 'insufficient', sampleSize: series.length };
  }

  const windowed = series.slice(-TREND_WINDOW_SIZE);
  const mid = Math.floor(windowed.length / 2);
  const earlierHalf = windowed.slice(0, mid);
  const laterHalf = windowed.slice(mid);

  const earlierAvg = mean(earlierHalf);
  const laterAvg = mean(laterHalf);

  const pctChange = earlierAvg !== 0 ? (laterAvg - earlierAvg) / Math.abs(earlierAvg) : laterAvg > 0 ? 1 : laterAvg < 0 ? -1 : 0;

  let state: TrendState;
  if (Math.abs(pctChange) <= STABLE_TOLERANCE_PCT) {
    state = 'stable';
  } else if (pctChange > 0) {
    state = higherIsBetter ? 'improving' : 'declining';
  } else {
    state = higherIsBetter ? 'declining' : 'improving';
  }

  const confidence: TrendConfidence = windowed.length >= MIN_POINTS_FOR_SUFFICIENT_CONFIDENCE ? 'sufficient' : 'limited';

  return { state, confidence, sampleSize: windowed.length };
}

/** Change direction between exactly two already-computed summary numbers
 * (spec §14's week-over-week comparison) — a thin, explicit wrapper around
 * the same tolerance rule so "this week vs last week" and "exposure-over-
 * exposure" always agree on what counts as "changed". */
export function directionBetween(
  thisValue: number | null,
  lastValue: number | null,
  higherIsBetter = true
): 'up' | 'down' | 'unchanged' | 'insufficient_data' {
  if (thisValue === null || lastValue === null || !Number.isFinite(thisValue) || !Number.isFinite(lastValue)) {
    return 'insufficient_data';
  }
  const result = classifyTrend([lastValue, thisValue], { higherIsBetter });
  if (result.state === 'stable') return 'unchanged';
  // classifyTrend already accounts for higherIsBetter when producing
  // improving/declining; translate back to a plain up/down (raw direction
  // of the numbers), which is what a week-over-week table displays.
  return thisValue > lastValue ? 'up' : thisValue < lastValue ? 'down' : 'unchanged';
}
