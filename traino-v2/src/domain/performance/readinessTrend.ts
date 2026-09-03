import type { DailyReadinessRecord } from '../readiness/types';
import type { ReadinessTrendSummary } from './types';
import { classifyTrend } from './trendClassifier';

/**
 * Readiness / Recovery Trend (spec §10) — real numbers from the athlete's
 * own Daily Readiness check-ins only, oldest first. Never a diagnosis:
 * this only ever reports what the logged numbers show ("your average
 * readiness was lower this week"), never an inferred condition.
 */
export function buildReadinessTrend(records: DailyReadinessRecord[]): ReadinessTrendSummary {
  const checkInsCount = records.length;
  const averageScore = checkInsCount > 0 ? Math.round(records.reduce((sum, r) => sum + r.score, 0) / checkInsCount) : null;
  const lowReadinessDaysCount = records.filter((r) => r.status === 'reduced' || r.status === 'recovery').length;

  const sleepSeries = records.map((r) => (r.inputs.sleepQuality + r.inputs.sleepDurationBucket) / 2);

  return {
    hasData: checkInsCount > 0,
    checkInsCount,
    averageScore,
    lowReadinessDaysCount,
    scoreTrend: classifyTrend(records.map((r) => r.score)),
    sleepTrend: classifyTrend(sleepSeries),
    energyTrend: classifyTrend(records.map((r) => r.inputs.energy)),
    sorenessTrend: classifyTrend(
      records.map((r) => r.inputs.soreness),
      { higherIsBetter: false }
    ),
    stressTrend: classifyTrend(
      records.map((r) => r.inputs.stress),
      { higherIsBetter: false }
    ),
  };
}
