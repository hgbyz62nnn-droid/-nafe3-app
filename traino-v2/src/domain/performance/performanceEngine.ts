import type { Goal } from '../engine/types';
import type { SportId } from '../sports/sports';
import type { DayLog } from '../state/LogContext';
import type { DailyReadinessRecord } from '../readiness/types';
import type { TravelContext, CompetitionEvent } from '../context/types';
import type { ExercisePerformanceLog, ExerciseProgressionDecision } from '../progression/types';
import type { PerformanceSummary } from './types';
import { buildExerciseMetrics } from './exerciseMetrics';
import { buildTrainingConsistency } from './trainingConsistency';
import { buildNutritionProgress } from './nutritionProgress';
import { buildReadinessTrend } from './readinessTrend';
import { buildWeightTrend } from './weightTrend';
import { buildGoalProgress } from './goalProgress';
import { buildWeekComparison, type WeekSnapshot } from './weekComparison';
import { buildMilestones } from './milestones';
import { getExerciseByName } from '../exercise/registry';

/**
 * Top-level Performance Analytics orchestrator (spec: "PERFORMANCE SUMMARY"
 * stage of the RAW LOGS -> ... -> WEEKLY REPORT / PROGRESS UI / AI COACH
 * pipeline). Composes every sub-module above into ONE `PerformanceSummary`
 * that Progress, Weekly Report, Weekly Coaching, and the AI Coach all read
 * from — a single analytical source of truth (spec §25/§36), never
 * recomputed differently in each screen.
 *
 * Pure and deterministic: every input is data already fetched by the
 * caller (LogContext/DailyReadinessContext/TrainingContextStore getters) —
 * this function does no I/O, no randomness, no external calls, and never
 * reads `sport` for branching (only for a metadata dictionary lookup,
 * `sportRelevance[sportId]`, per spec §13).
 */
export interface BuildPerformanceSummaryInput {
  today: string;
  goal: Goal;
  sportId: SportId;
  plannedPerWeek: number;
  /** The athlete's current/assumed weight — the same honest fallback
   * `computeWeightTrend` already uses when there's no logged weight yet
   * (never a fabricated 0). */
  weightFallbackKg: number;
  nutritionTargets: { calories: number; proteinG: number };
  /** Every exercise name with logged history (see `LogContext.getAllLoggedExerciseNames`). */
  exerciseNames: string[];
  getExerciseHistory: (exerciseName: string) => ExercisePerformanceLog[];
  /** Today's real resolved progression decisions (see `TodaysWorkout.tsx` /
   * `AiCoachReplyContext.todaysProgressionDecisions`) — matched onto their
   * exercise's metrics, never recomputed from a guessed configuration. */
  todaysProgressionDecisions?: ExerciseProgressionDecision[];
  /** Most recent 30 day-logs, oldest first, calendar-complete (see
   * `LogContext.getRecentLogs(30)`) — the single source for weight trend,
   * training consistency, and nutrition progress, sliced internally into
   * this-week/last-week windows so every section agrees on the same weeks. */
  recentLogs30: DayLog[];
  /** Daily Readiness records covering the same 30-day window, oldest first. */
  readinessRecords30: DailyReadinessRecord[];
  travelContexts: TravelContext[];
  competitionEvents: CompetitionEvent[];
}

function sliceWeeks(recentLogs30: DayLog[]): { thisWeek: DayLog[]; lastWeek: DayLog[] } {
  return { thisWeek: recentLogs30.slice(-7), lastWeek: recentLogs30.slice(-14, -7) };
}

function readinessInRange(records: DailyReadinessRecord[], startDate: string, endDate: string): DailyReadinessRecord[] {
  return records.filter((r) => r.date >= startDate && r.date <= endDate);
}

export function buildPerformanceSummary(input: BuildPerformanceSummaryInput): PerformanceSummary {
  const { thisWeek: thisWeekLogs, lastWeek: lastWeekLogs } = sliceWeeks(input.recentLogs30);

  const exercises = input.exerciseNames.map((name) => {
    const history = input.getExerciseHistory(name);
    const relevance = getExerciseByName(name)?.sportRelevance[input.sportId];
    return buildExerciseMetrics(name, history, {
      todaysDecision: input.todaysProgressionDecisions?.find((d) => d.exerciseName === name),
      sportRelevance: relevance,
    });
  });

  const trainingConsistency = buildTrainingConsistency(thisWeekLogs, input.plannedPerWeek, input.travelContexts, input.competitionEvents);
  const lastWeekConsistency = buildTrainingConsistency(lastWeekLogs, input.plannedPerWeek, input.travelContexts, input.competitionEvents);

  const nutrition = buildNutritionProgress(thisWeekLogs, lastWeekLogs, input.nutritionTargets);
  const lastWeekNutrition = buildNutritionProgress(lastWeekLogs, [], input.nutritionTargets);

  const overallWeightTrend = buildWeightTrend(input.goal, input.recentLogs30, input.weightFallbackKg);
  const thisWeekWeightTrend = buildWeightTrend(input.goal, thisWeekLogs, input.weightFallbackKg);
  const lastWeekWeightTrend = buildWeightTrend(input.goal, lastWeekLogs, input.weightFallbackKg);

  const thisWeekReadiness =
    thisWeekLogs.length > 0 ? readinessInRange(input.readinessRecords30, thisWeekLogs[0].date, thisWeekLogs[thisWeekLogs.length - 1].date) : [];
  const lastWeekReadinessRecords =
    lastWeekLogs.length > 0 ? readinessInRange(input.readinessRecords30, lastWeekLogs[0].date, lastWeekLogs[lastWeekLogs.length - 1].date) : [];

  const readiness = buildReadinessTrend(input.readinessRecords30);
  const thisWeekReadinessSummary = buildReadinessTrend(thisWeekReadiness);
  const lastWeekReadinessSummary = buildReadinessTrend(lastWeekReadinessRecords);

  const goalProgress = buildGoalProgress(input.goal, trainingConsistency, nutrition, thisWeekReadinessSummary, thisWeekWeightTrend, exercises);

  const thisWeekSnapshot: WeekSnapshot = { consistency: trainingConsistency, nutrition, readiness: thisWeekReadinessSummary, weight: thisWeekWeightTrend };
  const lastWeekSnapshot: WeekSnapshot = {
    consistency: lastWeekConsistency,
    nutrition: lastWeekNutrition,
    readiness: lastWeekReadinessSummary,
    weight: lastWeekWeightTrend,
  };
  const weekComparison = buildWeekComparison(thisWeekSnapshot, lastWeekSnapshot);

  const milestones = buildMilestones({
    today: input.today,
    exercises: exercises.map((metrics) => ({ exerciseName: metrics.exerciseName, history: input.getExerciseHistory(metrics.exerciseName), metrics })),
    trainingConsistency,
    nutrition,
  });

  return {
    exercises,
    trainingConsistency,
    nutrition,
    readiness,
    weight: overallWeightTrend,
    goalProgress,
    weekComparison,
    milestones,
  };
}
