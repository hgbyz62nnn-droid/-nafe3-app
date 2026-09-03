import type { DayLog } from '../state/LogContext';
import type { NutritionProgressSummary } from './types';
import { computeDetailedNutritionAdherence } from '../nutrition/adherence';
import { classifyTrend } from './trendClassifier';

/**
 * Nutrition Progress (spec §9) — reuses the existing detailed adherence
 * engine (`domain/nutrition/adherence.ts`) directly rather than
 * recomputing calorie/protein ratios a second time. Low logging is always
 * reported as `hasDetailedData: false`, never as a fabricated 0% adherence.
 */
export function buildNutritionProgress(
  currentWeekLogs: DayLog[],
  priorWeekLogs: DayLog[],
  targets: { calories: number; proteinG: number }
): NutritionProgressSummary {
  const current = computeDetailedNutritionAdherence(currentWeekLogs, targets);
  const prior = computeDetailedNutritionAdherence(priorWeekLogs, targets);

  const series: number[] = [];
  if (!prior.isIncomplete && prior.caloriesAdherencePct !== null) series.push(prior.caloriesAdherencePct);
  if (!current.isIncomplete && current.caloriesAdherencePct !== null) series.push(current.caloriesAdherencePct);

  return {
    hasDetailedData: !current.isIncomplete,
    caloriesAdherencePct: current.caloriesAdherencePct,
    proteinAdherencePct: current.proteinAdherencePct,
    mealCompletionPct: current.mealCompletionPct,
    daysWithDetailedLogs: current.daysWithDetailedLogs,
    trend: classifyTrend(series),
  };
}
