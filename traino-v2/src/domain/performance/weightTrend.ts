import type { Goal } from '../engine/types';
import type { DayLog } from '../state/LogContext';
import type { TrendResult, WeightGoalAlignment, WeightTrendSummary } from './types';
import { computeWeightTrend, type WeightTrendResult } from '../engine/progressEngine';
import { classifyTrend } from './trendClassifier';

/**
 * Body Weight Trend (spec §11) — built on the existing `computeWeightTrend`
 * (unchanged), with a real multi-point trend classification and a cautious,
 * non-medical, goal-aware interpretation layered on top. `trend.state` uses
 * the fixed convention "improving = weight trending up, declining = weight
 * trending down" — a neutral direction label; whether that direction is
 * actually good is a SEPARATE question answered by `goalAlignment` below,
 * never conflated into the trend label itself.
 */
export function interpretWeightGoalAlignment(goal: Goal, trend: TrendResult): WeightGoalAlignment {
  if (trend.state === 'insufficient_data') return 'insufficient_data';

  switch (goal) {
    case 'fat_loss':
      if (trend.state === 'declining') return 'aligned';
      if (trend.state === 'improving') return 'diverging';
      return 'not_applicable';
    case 'muscle_gain':
      if (trend.state === 'improving') return 'aligned';
      if (trend.state === 'declining') return 'diverging';
      return 'not_applicable';
    case 'general_fitness':
    case 'recovery':
      return trend.state === 'stable' ? 'stable_as_expected' : 'diverging';
    case 'performance':
      return 'not_applicable';
  }
}

/**
 * `computeWeightTrend`'s own `points` array duplicates a SINGLE real
 * weigh-in into a 2-point `[w, w]` pair purely so a chart has something to
 * draw — that duplication must never be fed to the trend classifier as if
 * it were two real, independent data points (a lone weigh-in would then
 * misreport as a confident "stable" trend). This re-derives the real,
 * undplicated series straight from the day-logs for classification only;
 * `computeWeightTrend`'s own `points`/`deltaKg`/`hasData` stay exactly as
 * they are for chart rendering. */
function realWeighInSeries(recentLogs: DayLog[]): number[] {
  return recentLogs.filter((d): d is DayLog & { weightKg: number } => typeof d.weightKg === 'number').map((d) => d.weightKg);
}

export function buildWeightTrend(goal: Goal, recentLogs: DayLog[], fallbackWeightKg: number): WeightTrendSummary {
  const weightTrend: WeightTrendResult = computeWeightTrend(recentLogs, fallbackWeightKg);
  const trend = classifyTrend(realWeighInSeries(recentLogs));
  return {
    hasData: weightTrend.hasData,
    points: weightTrend.points,
    deltaKg: weightTrend.deltaKg,
    trend,
    goalAlignment: interpretWeightGoalAlignment(goal, trend),
  };
}

export { computeWeightTrend };
