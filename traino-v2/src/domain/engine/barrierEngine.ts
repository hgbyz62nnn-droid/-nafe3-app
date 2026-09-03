import type { DayLog } from '../state/LogContext';
import type { BarrierId } from '../coaching/barriers';
import type { Confidence, DetectedBarrier, Severity, WeekSummary, WeeklyCoachingRecord, WeeklyCheckIn } from '../coaching/types';
import { computeNutritionAdherence, computeRecoveryScore, computeWorkoutCompletion, computeWeekOverWeekWeightDelta } from './progressEngine';

/**
 * Deterministic barrier-analysis layer. Combines (A) the athlete's explicit
 * check-in selections with (B) objective logged behavior to decide how
 * strongly each selected barrier is actually corroborated by real data —
 * never the reverse (this never invents a barrier the athlete didn't
 * report, except for one honest "low adherence, no reason given" signal
 * when nothing was selected at all). This is coaching pattern detection,
 * not diagnosis: no barrier here implies or states a medical or
 * psychological condition.
 *
 * All thresholds are named constants, not tuned inline, so the rule a
 * given decision came from is always traceable.
 */

/** Below this completion ratio, the week counts as "struggled" for objective corroboration. */
export const LOW_COMPLETION_THRESHOLD = 0.6;
/** Below this ratio, severity escalates from medium to high. */
export const HIGH_SEVERITY_COMPLETION_THRESHOLD = 0.4;
/** computeRecoveryScore's scale is ~40-95; below this counts as objectively low recovery. */
export const LOW_RECOVERY_THRESHOLD = 55;
/** Below this nutrition-adherence percentage, nutrition-related barriers get objective corroboration. */
export const LOW_NUTRITION_THRESHOLD = 50;
/** At least this many missed sessions before "missed workouts" counts as an objective signal. */
export const MIN_MISSED_FOR_SIGNAL = 2;
/** Same primary barrier present in this many consecutive reviewed weeks (including the
 * current one) counts as a recurring pattern. */
export const RECURRING_THRESHOLD_WEEKS = 3;

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function completionRatioOf(summary: WeekSummary): number {
  return summary.workoutsPlanned > 0 ? summary.workoutsCompleted / summary.workoutsPlanned : 1;
}

function severityFromCompletion(ratio: number): Severity {
  if (ratio < HIGH_SEVERITY_COMPLETION_THRESHOLD) return 'high';
  if (ratio < LOW_COMPLETION_THRESHOLD) return 'medium';
  return 'low';
}

/** Builds the real, honestly-empty-when-absent weekly summary this whole layer runs on.
 * Reuses the existing generic progress calculations — nothing here is computed twice. */
export function computeWeekSummary(currentWeekLogs: DayLog[], priorWeekLogs: DayLog[], plannedPerWeek: number): WeekSummary {
  const { completed: workoutsCompleted } = computeWorkoutCompletion(currentWeekLogs);
  const workoutsPlanned = Math.max(plannedPerWeek, 0);
  const workoutsMissed = Math.max(workoutsPlanned - workoutsCompleted, 0);
  const completionPct = workoutsPlanned > 0 ? Math.round((workoutsCompleted / workoutsPlanned) * 100) : 0;
  const nutritionAdherencePct = computeNutritionAdherence(currentWeekLogs);
  const recoveryScore = computeRecoveryScore(currentWeekLogs, plannedPerWeek);
  const { deltaKg, hasData: hasWeightData } = computeWeekOverWeekWeightDelta(currentWeekLogs, priorWeekLogs);

  const hasData = currentWeekLogs.some(
    (d) => d.workoutCompleted || d.loggedMealSlots.length > 0 || typeof d.weightKg === 'number'
  );

  return {
    hasData,
    workoutsPlanned,
    workoutsCompleted,
    workoutsMissed,
    completionPct,
    nutritionAdherencePct,
    recoveryScore,
    weightDeltaKg: deltaKg,
    hasWeightData,
  };
}

function evidenceFor(barrier: BarrierId, summary: WeekSummary, explicit: boolean): { objectiveSignal: boolean; evidence: string[] } {
  const ratio = completionRatioOf(summary);
  const lowCompletion = ratio < LOW_COMPLETION_THRESHOLD;
  const objectiveMissed = summary.workoutsMissed >= MIN_MISSED_FOR_SIGNAL;
  const lowRecovery = summary.recoveryScore < LOW_RECOVERY_THRESHOLD;
  const lowNutrition = summary.nutritionAdherencePct < LOW_NUTRITION_THRESHOLD;
  const evidence: string[] = explicit ? [] : ['no barrier reported by the athlete'];

  switch (barrier) {
    case 'time':
    case 'work_study':
    case 'schedule_conflict': {
      const objectiveSignal = lowCompletion || objectiveMissed;
      if (objectiveSignal) evidence.push(`${summary.workoutsMissed} of ${summary.workoutsPlanned} planned sessions missed`);
      return { objectiveSignal, evidence };
    }
    case 'poor_sleep':
    case 'fatigue':
    case 'stress': {
      const objectiveSignal = lowRecovery && objectiveMissed;
      if (lowRecovery) evidence.push(`recovery score ${summary.recoveryScore}% (below ${LOW_RECOVERY_THRESHOLD}%)`);
      if (objectiveMissed) evidence.push(`${summary.workoutsMissed} sessions missed`);
      return { objectiveSignal, evidence };
    }
    case 'nutrition_difficulty':
    case 'budget': {
      const objectiveSignal = lowNutrition;
      if (objectiveSignal) evidence.push(`nutrition adherence ${summary.nutritionAdherencePct}% (below ${LOW_NUTRITION_THRESHOLD}%)`);
      return { objectiveSignal, evidence };
    }
    case 'lack_of_equipment':
    case 'travel':
    case 'workout_difficulty': {
      const objectiveSignal = objectiveMissed;
      if (objectiveSignal) evidence.push(`${summary.workoutsMissed} sessions missed`);
      return { objectiveSignal, evidence };
    }
    case 'injury_pain':
      // Safety-relevant: always acted on regardless of whether logged volume corroborates it.
      return { objectiveSignal: true, evidence: ['athlete reported pain/injury during training'] };
    case 'motivation':
    case 'other':
    default: {
      const objectiveSignal = lowCompletion;
      if (objectiveSignal) evidence.push(`${summary.workoutsCompleted} of ${summary.workoutsPlanned} planned sessions completed`);
      return { objectiveSignal, evidence };
    }
  }
}

/**
 * Combines the athlete's explicit selections with objective signals from `summary`
 * into a ranked list of detected barriers — most severe/confident first, with
 * `injury_pain` always sorted first when present (safety takes priority over any
 * completion-ratio math). Returns [] when nothing was selected and nothing in the
 * data suggests a problem — a genuinely good week has no barrier to report.
 */
export function detectBarriers(checkIn: WeeklyCheckIn | null, summary: WeekSummary): DetectedBarrier[] {
  const selected = checkIn?.barrierIds ?? [];
  const results: DetectedBarrier[] = [];
  const ratio = completionRatioOf(summary);

  for (const barrier of selected) {
    const { objectiveSignal, evidence } = evidenceFor(barrier, summary, true);
    const confidence: Confidence = objectiveSignal ? 'high' : 'medium';
    const severity: Severity = barrier === 'injury_pain' ? 'high' : severityFromCompletion(ratio);
    results.push({
      barrier,
      severity,
      confidence,
      evidence: [`athlete reported ${barrier.replace(/_/g, ' ')}`, ...evidence].join('; '),
      explicitlySelected: true,
      objectiveSignal,
    });
  }

  // Nothing selected, but the data alone shows a struggling week — surface an honest,
  // low-confidence "unspecified" signal rather than guessing which barrier applies.
  if (selected.length === 0 && summary.hasData && ratio < LOW_COMPLETION_THRESHOLD) {
    const { evidence } = evidenceFor('other', summary, false);
    results.push({
      barrier: 'other',
      severity: severityFromCompletion(ratio),
      confidence: 'low',
      evidence: evidence.join('; '),
      explicitlySelected: false,
      objectiveSignal: true,
    });
  }

  return results.sort((a, b) => {
    if (a.barrier === 'injury_pain' && b.barrier !== 'injury_pain') return -1;
    if (b.barrier === 'injury_pain' && a.barrier !== 'injury_pain') return 1;
    return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  });
}

/** The single strongest detected barrier for this week, or null on a clean week. */
export function pickPrimaryBarrier(detected: DetectedBarrier[]): DetectedBarrier | null {
  return detected[0] ?? null;
}

/**
 * Recurring-pattern detection across prior weekly reviews. `history` must be ordered
 * oldest -> newest and must NOT include the week currently being reviewed. A streak of
 * the same primary barrier — current week included — at or above RECURRING_THRESHOLD_WEEKS
 * counts as recurring.
 */
export function detectRecurringPattern(
  history: WeeklyCoachingRecord[],
  currentBarrier: BarrierId | null
): { isRecurring: boolean; recurringWeeks: number } {
  if (!currentBarrier) return { isRecurring: false, recurringWeeks: 0 };
  let streak = 1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].decision?.barrier === currentBarrier) streak++;
    else break;
  }
  return { isRecurring: streak >= RECURRING_THRESHOLD_WEEKS, recurringWeeks: streak };
}
