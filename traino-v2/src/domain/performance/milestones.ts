import type { ExercisePerformanceLog } from '../progression/types';
import type { ExercisePerformanceMetrics, Milestone, NutritionProgressSummary, TrainingConsistencySummary } from './types';
import { classifyCompletion } from '../engine/exerciseProgressionEngine';
import { latestExposureSetPersonalRecord } from './exerciseMetrics';
import { daysBetween, parseLocalDateKey } from '../engine/dateUtils';

/**
 * Deterministic, subtle Performance Milestones (spec §7) — a short, useful
 * list, never a gamification wall. Only milestones that happened within a
 * bounded recent window are surfaced, so this never turns into an
 * exhaustive lifetime achievement log.
 */

export const MILESTONE_WINDOW_DAYS = 14;
export const NUTRITION_ADHERENCE_MILESTONE_PCT = 80;

function withinWindow(date: string, today: string, windowDays: number): boolean {
  const d = parseLocalDateKey(date);
  const t = parseLocalDateKey(today);
  if (!d || !t) return false;
  const diff = daysBetween(d, t);
  return diff >= 0 && diff <= windowDays;
}

export interface MilestonesInput {
  today: string;
  windowDays?: number;
  exercises: { exerciseName: string; history: ExercisePerformanceLog[]; metrics: ExercisePerformanceMetrics }[];
  trainingConsistency: TrainingConsistencySummary;
  nutrition: NutritionProgressSummary;
}

export function buildMilestones(input: MilestonesInput): Milestone[] {
  const windowDays = input.windowDays ?? MILESTONE_WINDOW_DAYS;
  const milestones: Milestone[] = [];

  for (const { exerciseName, history, metrics } of input.exercises) {
    const successful = history
      .filter((log) => classifyCompletion(log) === 'full' && log.contextMode === undefined)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (successful.length >= 1 && withinWindow(successful[0].date, input.today, windowDays)) {
      milestones.push({
        type: 'first_exposure',
        date: successful[0].date,
        exerciseName,
        message: `First logged session for ${exerciseName}.`,
      });
    }

    if (successful.length >= 3 && withinWindow(successful[2].date, input.today, windowDays)) {
      milestones.push({
        type: 'three_exposures',
        date: successful[2].date,
        exerciseName,
        message: `3 successful sessions logged for ${exerciseName}.`,
      });
    }

    if (
      metrics.latestProgressionDecision?.decision === 'PROGRESS' &&
      metrics.current &&
      withinWindow(metrics.current.date, input.today, windowDays)
    ) {
      milestones.push({
        type: 'progression_achieved',
        date: metrics.current.date,
        exerciseName,
        message: `Progressed ${exerciseName}: ${metrics.latestProgressionDecision.reason}`,
      });
    }

    const newPr = latestExposureSetPersonalRecord(exerciseName, metrics.model, history);
    if (newPr && withinWindow(newPr.achievedOn, input.today, windowDays)) {
      milestones.push({
        type: 'new_personal_record',
        date: newPr.achievedOn,
        exerciseName,
        message: `New personal record for ${exerciseName}: ${newPr.label} (${newPr.bracketLabel}).`,
      });
    }
  }

  if (input.trainingConsistency.hasData && input.trainingConsistency.plannedSessions > 0 && input.trainingConsistency.completionPct >= 100) {
    milestones.push({
      type: 'consistency',
      date: input.today,
      message: `You completed every planned session this week.`,
    });
  }

  if (input.nutrition.hasDetailedData && (input.nutrition.caloriesAdherencePct ?? 0) >= NUTRITION_ADHERENCE_MILESTONE_PCT) {
    milestones.push({
      type: 'nutrition_adherence',
      date: input.today,
      message: `Nutrition adherence stayed at ${input.nutrition.caloriesAdherencePct}% or higher this week.`,
    });
  }

  return milestones.sort((a, b) => b.date.localeCompare(a.date));
}
