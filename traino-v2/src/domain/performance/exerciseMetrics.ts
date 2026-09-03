import type { ExercisePerformanceLog, ExerciseProgressionDecision, ProgressionModel } from '../progression/types';
import type { ComparableExposure, ExercisePerformanceMetrics, PersonalRecord } from './types';
import { classifyCompletion } from '../engine/exerciseProgressionEngine';
import { primaryMetric } from '../engine/progressEngine';
import { classifyTrend } from './trendClassifier';
import { getExerciseByName } from '../exercise/registry';

/**
 * Per-exercise Performance Metrics (spec §3) — real numbers only, from an
 * exercise's own logged history and its own progression model. Every
 * exercise NAME gets its own independent metrics object: a substitution
 * (spec §18) is a different `exerciseName` with its own history, never
 * merged into the original's.
 */

/** An exposure is "comparable" for trend/PR purposes only when it was fully
 * completed AND logged under normal context — Travel/Competition-adjusted
 * or partial/missed sessions are never allowed to move a trend or set a
 * record (spec §5/§17), though they're still counted in the raw exposure
 * totals below for transparency. */
function isComparable(log: ExercisePerformanceLog): boolean {
  return classifyCompletion(log) === 'full' && log.contextMode === undefined;
}

/** Resolves the exercise's progression model for a NAMED exercise with no
 * associated plan slot (the Progress screen lists every exercise ever
 * logged, not just today's plan). Prefers the Exercise Library's own
 * authoritative `progressionModel`; falls back to inferring from which
 * numeric field the athlete's own logs actually populated — the same fixed
 * priority order `primaryMetric` already uses, so the inferred model always
 * matches the metric actually being read. Never guessed from the exercise's
 * name. */
function resolveModel(exerciseName: string, history: ExercisePerformanceLog[]): ProgressionModel {
  const fromLibrary = getExerciseByName(exerciseName)?.progressionModel;
  if (fromLibrary) return fromLibrary;

  for (const log of history) {
    if (log.loadKg !== undefined) return 'load';
    if (log.distanceM !== undefined) return 'distance';
    if (log.durationSec !== undefined) return 'duration';
    if (log.repsAchieved !== undefined) return 'rep_range';
  }
  return 'technique';
}

function toExposure(log: ExercisePerformanceLog): ComparableExposure | null {
  const metric = primaryMetric(log);
  if (!metric) return null;
  return { date: log.date, value: metric.value, label: metric.label };
}

/** The bracket a load-model exposure belongs to for PR purposes — "10 reps",
 * so 70kg×10 is only ever compared against other 10-rep exposures, never
 * against 72.5kg×8 (spec §6's explicit non-comparable example). Exposures
 * with no logged rep count have no bracket and are excluded from PR
 * detection entirely (insufficient evidence to claim comparability). */
function bracketLabelFor(model: ProgressionModel, log: ExercisePerformanceLog): string | null {
  if (model === 'load') {
    return log.repsAchieved !== undefined ? `${log.repsAchieved} reps` : null;
  }
  if (model === 'rep_range' || model === 'distance' || model === 'duration') {
    return 'PR';
  }
  return null; // technique: never comparable to a single number (spec §6/§3)
}

/**
 * Deterministic Personal Record detection (spec §6). Walks the comparable,
 * normal-context, fully-completed history in chronological order tracking
 * each bracket's running max; a bracket's PR is whichever exposure most
 * recently set a STRICT new max within it (a tie never overwrites the
 * existing PR's date — insufficient evidence that anything new happened).
 * Technique-model exercises never produce a PR at all.
 */
export function detectPersonalRecords(exerciseName: string, model: ProgressionModel, history: ExercisePerformanceLog[]): PersonalRecord[] {
  if (model === 'technique') return [];

  const comparable = history.filter(isComparable).sort((a, b) => a.date.localeCompare(b.date));
  const runningMax = new Map<string, number>();
  const records = new Map<string, PersonalRecord>();
  const mostRecentDate = comparable.length > 0 ? comparable[comparable.length - 1].date : null;

  for (const log of comparable) {
    const bracket = bracketLabelFor(model, log);
    if (bracket === null) continue;
    const metric = primaryMetric(log);
    if (!metric) continue;

    const currentMax = runningMax.get(bracket);
    if (currentMax === undefined || metric.value > currentMax) {
      runningMax.set(bracket, metric.value);
      records.set(bracket, {
        exerciseName,
        model,
        bracketLabel: bracket,
        value: metric.value,
        label: metric.label,
        achievedOn: log.date,
        isRecent: log.date === mostRecentDate,
      });
    }
  }

  return Array.from(records.values()).sort((a, b) => a.bracketLabel.localeCompare(b.bracketLabel));
}

/** True when the exercise's LATEST comparable exposure itself set a brand
 * new personal record (strictly beat everything before it in its own
 * bracket) — the "new comparable PR" milestone trigger (spec §7). A first-
 * ever exposure in a bracket is a baseline, never a "record" over nothing
 * (spec §6: insufficient evidence -> no PR claim). */
export function latestExposureSetPersonalRecord(exerciseName: string, model: ProgressionModel, history: ExercisePerformanceLog[]): PersonalRecord | null {
  const records = detectPersonalRecords(exerciseName, model, history);
  const comparable = history.filter(isComparable).sort((a, b) => a.date.localeCompare(b.date));
  if (comparable.length < 2) return null; // needs a prior comparable exposure to beat

  const latest = comparable[comparable.length - 1];
  const bracket = bracketLabelFor(model, latest);
  if (bracket === null) return null;

  const priorInBracket = comparable.slice(0, -1).some((log) => bracketLabelFor(model, log) === bracket);
  if (!priorInBracket) return null;

  const record = records.find((r) => r.bracketLabel === bracket);
  return record && record.achievedOn === latest.date ? record : null;
}

export interface ExerciseMetricsOptions {
  /** Today's real resolved progression decision for this exercise, if it's
   * part of today's plan (see `AiCoachReplyContext.todaysProgressionDecisions`
   * / `TodaysWorkout.tsx`) — never recomputed from a guessed configuration
   * for an exercise with no associated plan slot. Absent = honestly null,
   * never fabricated. */
  todaysDecision?: ExerciseProgressionDecision;
  sportRelevance?: 'primary' | 'supportive' | 'general';
}

/**
 * Builds one exercise's full Performance Metrics from its real logged
 * history (already scoped to this exercise name, oldest first — the same
 * convention `LogContext.getExerciseHistory` already returns).
 */
export function buildExerciseMetrics(exerciseName: string, history: ExercisePerformanceLog[], options: ExerciseMetricsOptions = {}): ExercisePerformanceMetrics {
  const model = resolveModel(exerciseName, history);

  const comparable = history
    .filter(isComparable)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(toExposure)
    .filter((e): e is ComparableExposure => e !== null);

  const current = comparable.length > 0 ? comparable[comparable.length - 1] : null;
  const previous = comparable.length > 1 ? comparable[comparable.length - 2] : null;
  const best = comparable.length > 0 ? comparable.reduce((max, e) => (e.value > max.value ? e : max)) : null;

  const trend = classifyTrend(comparable.map((e) => e.value));

  const successfulExposures = history.filter((log) => classifyCompletion(log) === 'full').length;
  const failedOrPartialExposures = history.length - successfulExposures;
  const contextualExposureCount = history.filter((log) => log.contextMode !== undefined).length;

  return {
    exerciseName,
    model,
    totalExposures: history.length,
    successfulExposures,
    failedOrPartialExposures,
    contextualExposureCount,
    previous,
    current,
    best,
    trend,
    personalRecords: detectPersonalRecords(exerciseName, model, history),
    latestProgressionDecision: options.todaysDecision ?? null,
    sportRelevance: options.sportRelevance,
  };
}
