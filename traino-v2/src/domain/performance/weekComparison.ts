import type { NutritionProgressSummary, ReadinessTrendSummary, TrainingConsistencySummary, WeekComparisonSummary, WeightTrendSummary } from './types';
import { directionBetween } from './trendClassifier';

/**
 * Week-over-week comparison (spec §14) — structured metric deltas only,
 * never an invented causal explanation. Each metric independently reports
 * `insufficient_data` when either week lacks the evidence to compare, so a
 * missing prior week never silently reads as "down".
 */
export interface WeekSnapshot {
  consistency: TrainingConsistencySummary;
  nutrition: NutritionProgressSummary;
  readiness: ReadinessTrendSummary;
  weight: WeightTrendSummary;
}

export function buildWeekComparison(thisWeek: WeekSnapshot, lastWeek: WeekSnapshot): WeekComparisonSummary {
  const trainingThis = thisWeek.consistency.hasData ? thisWeek.consistency.completionPct : null;
  const trainingLast = lastWeek.consistency.hasData ? lastWeek.consistency.completionPct : null;

  const nutritionThis = thisWeek.nutrition.hasDetailedData ? thisWeek.nutrition.caloriesAdherencePct : null;
  const nutritionLast = lastWeek.nutrition.hasDetailedData ? lastWeek.nutrition.caloriesAdherencePct : null;

  const readinessThis = thisWeek.readiness.hasData ? thisWeek.readiness.averageScore : null;
  const readinessLast = lastWeek.readiness.hasData ? lastWeek.readiness.averageScore : null;

  const weightThis = thisWeek.weight.hasData ? thisWeek.weight.deltaKg : null;
  const weightLast = lastWeek.weight.hasData ? lastWeek.weight.deltaKg : null;

  return {
    metrics: [
      { label: 'Training consistency', thisWeek: trainingThis, lastWeek: trainingLast, direction: directionBetween(trainingThis, trainingLast) },
      { label: 'Nutrition adherence', thisWeek: nutritionThis, lastWeek: nutritionLast, direction: directionBetween(nutritionThis, nutritionLast) },
      { label: 'Readiness', thisWeek: readinessThis, lastWeek: readinessLast, direction: directionBetween(readinessThis, readinessLast) },
      { label: 'Weight trend', thisWeek: weightThis, lastWeek: weightLast, direction: directionBetween(weightThis, weightLast) },
    ],
  };
}
