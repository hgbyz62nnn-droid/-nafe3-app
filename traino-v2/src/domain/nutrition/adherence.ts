import type { DayLog } from '../state/LogContext';
import type { WeightTrendResult } from '../engine/progressEngine';
import type { Goal } from '../engine/types';

/**
 * Nutrition adherence + weight-trend-aware target review (spec §22/§24).
 * `computeNutritionAdherence` in progressEngine.ts (the existing slot-completion
 * percentage barrierEngine.ts already reads for the `nutrition_difficulty`/`budget`
 * barriers) is left completely unchanged — this file ADDS detailed calorie/protein
 * adherence on top, for days that have the richer `nutritionLogs` data, without
 * touching that existing contract.
 */

export interface DetailedNutritionAdherence {
  /** null = not enough logged detail to compute (never presented as "0% adherence"). */
  caloriesAdherencePct: number | null;
  proteinAdherencePct: number | null;
  /** The existing slot-completion metric — always computable, same semantics as
   * `computeNutritionAdherence`. */
  mealCompletionPct: number;
  daysWithDetailedLogs: number;
  /** True when there isn't enough detailed logging to trust caloriesAdherencePct/
   * proteinAdherencePct — missing logging is never presented as failed nutrition. */
  isIncomplete: boolean;
}

const MIN_DAYS_FOR_DETAILED_ADHERENCE = 2;

/**
 * Detailed calorie/protein adherence from real logged food entries, only for days
 * that actually have `nutritionLogs`. A day with no detailed log simply isn't counted
 * — it's excluded from the average, never treated as 0% adherence.
 */
export function computeDetailedNutritionAdherence(
  recentLogs: DayLog[],
  targets: { calories: number; proteinG: number }
): DetailedNutritionAdherence {
  const totalSlots = recentLogs.length * 4;
  const loggedSlots = recentLogs.reduce((sum, d) => sum + d.loggedMealSlots.length, 0);
  const mealCompletionPct = totalSlots > 0 ? Math.round((loggedSlots / totalSlots) * 100) : 0;

  const daysWithLogs = recentLogs.filter((d) => (d.nutritionLogs?.length ?? 0) > 0);
  if (daysWithLogs.length < MIN_DAYS_FOR_DETAILED_ADHERENCE || targets.calories <= 0) {
    return { caloriesAdherencePct: null, proteinAdherencePct: null, mealCompletionPct, daysWithDetailedLogs: daysWithLogs.length, isIncomplete: true };
  }

  const dayRatios = daysWithLogs.map((day) => {
    const totals = (day.nutritionLogs ?? []).reduce(
      (sum, entry) => ({ calories: sum.calories + entry.calories, proteinG: sum.proteinG + entry.proteinG }),
      { calories: 0, proteinG: 0 }
    );
    return {
      caloriesRatio: Math.min(totals.calories / targets.calories, 1.5),
      proteinRatio: targets.proteinG > 0 ? Math.min(totals.proteinG / targets.proteinG, 1.5) : 1,
    };
  });

  const avgCaloriesRatio = dayRatios.reduce((s, r) => s + r.caloriesRatio, 0) / dayRatios.length;
  const avgProteinRatio = dayRatios.reduce((s, r) => s + r.proteinRatio, 0) / dayRatios.length;

  return {
    caloriesAdherencePct: Math.round(Math.min(avgCaloriesRatio, 1) * 100),
    proteinAdherencePct: Math.round(Math.min(avgProteinRatio, 1) * 100),
    mealCompletionPct,
    daysWithDetailedLogs: daysWithLogs.length,
    isIncomplete: false,
  };
}

export interface TargetReviewRecommendation {
  shouldReview: boolean;
  reason: string;
}

/** Weight-trend divergence threshold before recommending a target review — small
 * week-to-week fluctuation (water, food timing) is expected and never triggers this. */
const DIVERGENT_TREND_KG = 0.5;

/**
 * A deterministic, conservative "you may want to review your target" flag — spec
 * §24: never automatically changes calories, never invokes medical/eating-disorder
 * logic. Only fires when the athlete's ACTUAL multi-day weight trend consistently
 * moves opposite to their stated goal by more than a small threshold.
 */
export function recommendNutritionTargetReview(goal: Goal, weightTrend: WeightTrendResult): TargetReviewRecommendation | null {
  if (!weightTrend.hasData) return null;

  if (goal === 'fat_loss' && weightTrend.deltaKg >= DIVERGENT_TREND_KG) {
    return {
      shouldReview: true,
      reason: `Your logged weight has trended up ${weightTrend.deltaKg}kg over this window despite a fat-loss goal — you may want to review your calorie target.`,
    };
  }
  if (goal === 'muscle_gain' && weightTrend.deltaKg <= -DIVERGENT_TREND_KG) {
    return {
      shouldReview: true,
      reason: `Your logged weight has trended down ${Math.abs(weightTrend.deltaKg)}kg over this window despite a muscle-gain goal — you may want to review your calorie target.`,
    };
  }
  return null;
}
