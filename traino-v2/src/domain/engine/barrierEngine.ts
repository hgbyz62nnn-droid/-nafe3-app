import type { DayLog } from '../state/LogContext';
import type { DailyReadinessRecord } from '../readiness/types';
import type { TravelContext, CompetitionEvent } from '../context/types';
import type { ExercisePerformanceMetrics } from '../performance/types';
import type { BarrierId } from '../coaching/barriers';
import type { Confidence, DetectedBarrier, Severity, WeekSummary, WeeklyCoachingRecord, WeeklyCheckIn } from '../coaching/types';
import { computeWeekOverWeekWeightDelta } from './progressEngine';
import { buildTrainingConsistency } from '../performance/trainingConsistency';
import { buildNutritionProgress } from '../performance/nutritionProgress';
import { buildReadinessTrend } from '../performance/readinessTrend';

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
 *
 * Phase 11 ("Coaching Intelligence Cleanup"): this file used to derive its
 * readiness/recovery evidence partly from `progressEngine.computeRecoveryScore`
 * — a completion-ratio proxy that never actually measured recovery. That
 * dependency is now REMOVED. Readiness, training consistency, nutrition
 * adherence, and workout-difficulty evidence are all sourced from the
 * Phase 10 Performance Analytics layer (`domain/performance/`) — the same
 * functions Progress, Weekly Report, and the AI Coach already read from —
 * so Weekly Coaching never recomputes a competing definition of any of
 * these metrics.
 */

/** Below this completion ratio, the week counts as "struggled" for objective corroboration. */
export const LOW_COMPLETION_THRESHOLD = 0.6;
/** Below this ratio, severity escalates from medium to high. */
export const HIGH_SEVERITY_COMPLETION_THRESHOLD = 0.4;
/** Below this nutrition-adherence percentage, nutrition-related barriers get objective corroboration.
 * Applied to the DETAILED (calorie-based) adherence when enough logging exists this week,
 * falling back to the basic meal-slot-completion percentage otherwise — never applied to a
 * fabricated 0% for a week with no logging at all (see `evidenceFor`'s nutrition branch). */
export const LOW_NUTRITION_THRESHOLD = 50;
/** At least this many missed sessions before "missed workouts" counts as an objective signal. */
export const MIN_MISSED_FOR_SIGNAL = 2;
/** Same primary barrier present in this many consecutive reviewed weeks (including the
 * current one) counts as a recurring pattern. */
export const RECURRING_THRESHOLD_WEEKS = 3;
/** At least this many low-readiness (reduced/recovery) days in a week corroborates a
 * fatigue/stress/poor_sleep barrier — sourced directly from real Daily Readiness
 * check-ins (`performance/readinessTrend.ts`), never a completion-derived proxy.
 * Unchanged from the pre-Phase-11 value: this threshold was already tuned against
 * real readiness data (it was already the OR-branch alongside the old proxy), so no
 * new threshold had to be guessed for the Phase 11 migration (spec §4). */
export const LOW_READINESS_DAYS_THRESHOLD = 3;
/** At least this many poor/short-sleep days in a week corroborates the poor_sleep barrier. */
export const POOR_SLEEP_DAYS_THRESHOLD = 3;
/** A readiness scale value at or below this counts as "poor" for sleepQuality/sleepDurationBucket. */
const POOR_SLEEP_SCALE_MAX = 2;
/** Minimum average-score gain (0-100 scale) between two weeks to call it an improvement. */
export const READINESS_IMPROVEMENT_THRESHOLD = 8;
/** At least this many exercises showing a real declining comparable trend (spec §7's
 * "declining comparable exercise trend") corroborates workout_difficulty. Set to 1 (not
 * higher) because a "declining" classification itself already requires multiple
 * comparable exposures (`performance/trendClassifier.ts` never classifies a trend from
 * a single point) — by the time ONE exercise counts as declining, real multi-session
 * evidence already backs it; this is not "one bad set". */
export const STRUGGLING_EXERCISES_THRESHOLD = 1;

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

function isLowReadinessDay(record: DailyReadinessRecord): boolean {
  return record.status === 'reduced' || record.status === 'recovery';
}

function isPoorSleepDay(record: DailyReadinessRecord): boolean {
  return record.inputs.sleepQuality <= POOR_SLEEP_SCALE_MAX || record.inputs.sleepDurationBucket <= POOR_SLEEP_SCALE_MAX;
}

/** A real, multi-exposure struggle signal for one exercise — a comparable
 * declining trend (never a single bad set, see `STRUGGLING_EXERCISES_THRESHOLD`).
 * Reads only `ExercisePerformanceMetrics.trend`, already computed by
 * `performance/exerciseMetrics.ts` — nothing here re-derives a trend. */
function isStrugglingExercise(metrics: ExercisePerformanceMetrics): boolean {
  return metrics.trend.state === 'declining';
}

export interface WeekSummaryContext {
  /** Active Travel contexts covering this week — reused (never re-derived) so a
   * travel-adjusted day is never counted as an ordinary missed workout (spec §15). */
  travelContexts?: TravelContext[];
  /** Active Competition events covering this week — same context-awareness as travel. */
  competitionEvents?: CompetitionEvent[];
  /** Real per-exercise performance metrics for exercises logged this week (or with
   * relevant recent history) — see `performance/exerciseMetrics.ts`. Absent/empty is
   * honest "no exercise evidence yet", never treated as "no difficulty". */
  exercises?: ExercisePerformanceMetrics[];
  /** The athlete's calorie/protein targets, needed to compute detailed nutrition
   * adherence (`performance/nutritionProgress.ts`). Omitted falls back to the basic
   * meal-slot-completion percentage only. */
  nutritionTargets?: { calories: number; proteinG: number };
}

/** Builds the real, honestly-empty-when-absent weekly summary this whole layer runs on.
 * Reuses the Phase 10 Performance Analytics functions (`buildTrainingConsistency`,
 * `buildNutritionProgress`, `buildReadinessTrend`) — the SAME functions Progress,
 * Weekly Report, and the AI Coach read from — so this never recomputes a competing
 * definition of consistency/nutrition/readiness (spec §2/§10).
 *
 * `plannedPerWeek` is the athlete's RAW weekly cadence (e.g.
 * `answers.daysAvailablePerWeek`) — context-adjustment for active Travel/Competition
 * happens internally via `context.travelContexts`/`context.competitionEvents`
 * (`buildTrainingConsistency` already does this), so callers must NOT pre-adjust it
 * themselves (doing so would double-adjust).
 *
 * `weekReadiness` is the subset of Daily Check-in records whose date falls within this
 * same week (pre-filtered by the caller, the same way `currentWeekLogs` already is);
 * pass [] when readiness history isn't available for a caller. */
export function computeWeekSummary(
  currentWeekLogs: DayLog[],
  priorWeekLogs: DayLog[],
  plannedPerWeek: number,
  weekReadiness: DailyReadinessRecord[] = [],
  context: WeekSummaryContext = {}
): WeekSummary {
  const travelContexts = context.travelContexts ?? [];
  const competitionEvents = context.competitionEvents ?? [];
  const exercises = context.exercises ?? [];

  const consistency = buildTrainingConsistency(currentWeekLogs, plannedPerWeek, travelContexts, competitionEvents);
  const workoutsPlanned = consistency.plannedSessions;
  const workoutsCompleted = consistency.completedSessions;
  const workoutsMissed = Math.max(workoutsPlanned - workoutsCompleted, 0);
  const completionPct = consistency.completionPct;

  const nutrition = buildNutritionProgress(currentWeekLogs, priorWeekLogs, context.nutritionTargets ?? { calories: 0, proteinG: 0 });
  const nutritionAdherencePct = nutrition.mealCompletionPct;
  const nutritionHasDetailedData = nutrition.hasDetailedData;
  const nutritionDetailedAdherencePct = nutrition.caloriesAdherencePct;

  const { deltaKg, hasData: hasWeightData } = computeWeekOverWeekWeightDelta(currentWeekLogs, priorWeekLogs);

  const hasData = currentWeekLogs.some(
    (d) => d.workoutCompleted || d.loggedMealSlots.length > 0 || typeof d.weightKg === 'number'
  );

  const readinessTrend = buildReadinessTrend(weekReadiness);
  const readinessCheckInsCount = readinessTrend.checkInsCount;
  const readinessAverageScore = readinessTrend.averageScore;
  const readinessLowDaysCount = readinessTrend.lowReadinessDaysCount;
  const poorSleepDaysCount = weekReadiness.filter(isPoorSleepDay).length;
  const readinessLowAndPoorSleepOverlapDays = weekReadiness.filter((r) => isLowReadinessDay(r) && isPoorSleepDay(r)).length;

  // Co-occurrence, never causation (spec §6): a day whose readiness check-in was low
  // AND whose planned workout was not completed, on the SAME calendar date.
  const missedDates = new Set(currentWeekLogs.filter((d) => !d.workoutCompleted).map((d) => d.date));
  const readinessLowAndMissedWorkoutOverlapDays = weekReadiness.filter((r) => isLowReadinessDay(r) && missedDates.has(r.date)).length;

  const strugglingExercisesCount = exercises.filter(isStrugglingExercise).length;
  const exercisesWithDataCount = exercises.filter((e) => e.totalExposures > 0).length;

  return {
    hasData,
    workoutsPlanned,
    workoutsCompleted,
    workoutsMissed,
    completionPct,
    nutritionAdherencePct,
    nutritionHasDetailedData,
    nutritionDetailedAdherencePct,
    weightDeltaKg: deltaKg,
    hasWeightData,
    readinessCheckInsCount,
    readinessAverageScore,
    readinessLowDaysCount,
    poorSleepDaysCount,
    readinessLowAndPoorSleepOverlapDays,
    readinessLowAndMissedWorkoutOverlapDays,
    strugglingExercisesCount,
    exercisesWithDataCount,
  };
}

/**
 * Deterministic, non-causal readiness-trend note for the weekly report — only ever
 * describes a co-occurrence ("readiness was higher alongside a reduced load"), never
 * asserts causation, per the same rule `evidenceFor` follows below. Returns null unless
 * an approved training-load reduction was actually in effect this week AND both weeks
 * have real check-in data AND the improvement clears a meaningful threshold.
 */
export function describeReadinessTrend(
  currentSummary: WeekSummary,
  priorSummary: WeekSummary,
  reducedLoadAppliedThisWeek: boolean
): string | null {
  if (!reducedLoadAppliedThisWeek) return null;
  if (currentSummary.readinessAverageScore === null || priorSummary.readinessAverageScore === null) return null;
  const delta = currentSummary.readinessAverageScore - priorSummary.readinessAverageScore;
  if (delta < READINESS_IMPROVEMENT_THRESHOLD) return null;
  return `Your readiness was higher this week (${currentSummary.readinessAverageScore}% vs ${priorSummary.readinessAverageScore}%), alongside last week's reduced training load.`;
}

function evidenceFor(barrier: BarrierId, summary: WeekSummary, explicit: boolean): { objectiveSignal: boolean; evidence: string[] } {
  const ratio = completionRatioOf(summary);
  const lowCompletion = ratio < LOW_COMPLETION_THRESHOLD;
  const objectiveMissed = summary.workoutsMissed >= MIN_MISSED_FOR_SIGNAL;
  // Prefer the detailed (calorie-based) adherence when this week has enough real food
  // logging to trust it; fall back to the basic meal-slot-completion percentage
  // otherwise. Incomplete logging is reported as incomplete logging, never as 0% —
  // "incomplete meal logging" and "adherence below threshold" are distinct evidence
  // (spec §5).
  const nutritionPctForEvidence = summary.nutritionHasDetailedData ? (summary.nutritionDetailedAdherencePct ?? 0) : summary.nutritionAdherencePct;
  const lowNutrition = summary.nutritionHasDetailedData && nutritionPctForEvidence < LOW_NUTRITION_THRESHOLD;
  const incompleteNutritionLogging = !summary.nutritionHasDetailedData && summary.nutritionAdherencePct < LOW_NUTRITION_THRESHOLD;
  const evidence: string[] = explicit ? [] : ['no barrier reported by the athlete'];

  switch (barrier) {
    case 'time':
    case 'work_study':
    case 'schedule_conflict': {
      const objectiveSignal = lowCompletion || objectiveMissed;
      if (objectiveSignal) evidence.push(`${summary.workoutsMissed} of ${summary.workoutsPlanned} planned sessions missed`);
      return { objectiveSignal, evidence };
    }
    case 'poor_sleep': {
      const lowReadinessSignal = summary.readinessLowDaysCount >= LOW_READINESS_DAYS_THRESHOLD;
      const poorSleepSignal = summary.poorSleepDaysCount >= POOR_SLEEP_DAYS_THRESHOLD;
      const objectiveSignal = lowReadinessSignal || poorSleepSignal;
      if (poorSleepSignal) evidence.push(`poor/short sleep reported on ${summary.poorSleepDaysCount} of ${summary.readinessCheckInsCount} check-in days`);
      if (lowReadinessSignal) evidence.push(`low readiness reported on ${summary.readinessLowDaysCount} of ${summary.readinessCheckInsCount} check-in days`);
      if (summary.readinessLowAndPoorSleepOverlapDays > 0) {
        evidence.push(`low readiness occurred alongside poor sleep on ${summary.readinessLowAndPoorSleepOverlapDays} days this week`);
      }
      if (objectiveMissed && summary.readinessLowAndMissedWorkoutOverlapDays > 0) {
        evidence.push(`low readiness and lower training completion overlapped on ${summary.readinessLowAndMissedWorkoutOverlapDays} day(s) this week`);
      }
      return { objectiveSignal, evidence };
    }
    case 'fatigue':
    case 'stress': {
      const lowReadinessSignal = summary.readinessLowDaysCount >= LOW_READINESS_DAYS_THRESHOLD;
      const objectiveSignal = lowReadinessSignal;
      if (lowReadinessSignal) evidence.push(`low readiness reported on ${summary.readinessLowDaysCount} of ${summary.readinessCheckInsCount} check-in days`);
      if (objectiveMissed && summary.readinessLowAndMissedWorkoutOverlapDays > 0) {
        // Co-occurrence only — never a causal claim (spec §3/§6): this never says
        // "low readiness caused your missed workouts", only that both occurred on
        // the same day(s) this week.
        evidence.push(`low readiness and lower training completion overlapped on ${summary.readinessLowAndMissedWorkoutOverlapDays} day(s) this week`);
      } else if (objectiveMissed) {
        evidence.push(`${summary.workoutsMissed} sessions missed`);
      }
      return { objectiveSignal, evidence };
    }
    case 'nutrition_difficulty':
    case 'budget': {
      const objectiveSignal = lowNutrition || incompleteNutritionLogging;
      if (lowNutrition) evidence.push(`nutrition adherence ${nutritionPctForEvidence}% (below ${LOW_NUTRITION_THRESHOLD}%)`);
      else if (incompleteNutritionLogging) evidence.push(`incomplete meal logging this week (${summary.nutritionAdherencePct}% of meal slots logged)`);
      return { objectiveSignal, evidence };
    }
    case 'lack_of_equipment':
    case 'travel':
      // Not a real difficulty/performance signal — these are access/logistics
      // barriers, evidenced only by missed sessions (equipment/travel access
      // does not show up in exercise performance trends).
      return objectiveMissed
        ? { objectiveSignal: true, evidence: [...evidence, `${summary.workoutsMissed} sessions missed`] }
        : { objectiveSignal: false, evidence };
    case 'workout_difficulty': {
      // Real performance evidence (spec §7): a session being genuinely too hard
      // shows up as exercises struggling to progress, not as missed sessions
      // (which is a consistency/access signal, not a difficulty one). Missed
      // sessions remain a weaker fallback signal for athletes with no exercise
      // history logged yet (spec §14's sparse-data honesty).
      const strugglingSignal = summary.exercisesWithDataCount > 0 && summary.strugglingExercisesCount >= STRUGGLING_EXERCISES_THRESHOLD;
      const objectiveSignal = strugglingSignal || objectiveMissed;
      if (strugglingSignal) {
        evidence.push(`${summary.strugglingExercisesCount} of ${summary.exercisesWithDataCount} logged exercises showing a declining trend`);
      }
      if (objectiveMissed) evidence.push(`${summary.workoutsMissed} sessions missed`);
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
