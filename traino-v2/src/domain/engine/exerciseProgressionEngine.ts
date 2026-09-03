import type {
  ExerciseProgressionDecision,
  ExercisePerformanceLog,
  ProgressionConfidence,
  ProgressionModelConfig,
  ProgressionTarget,
} from '../progression/types';
import type { ReadinessStatus } from '../readiness/types';
import { DEFAULT_LOAD_INCREMENT_KG } from './progressionModels';

/**
 * Deterministic exercise-level Progression Engine — answers "based on what this
 * athlete actually did, how should the next exposure to this exercise progress?"
 * Pure functions over structured evidence (`ExercisePerformanceLog` history), no I/O,
 * no randomness, no sport/exercise-name branching: every rule below reads only the
 * exercise's inferred `ProgressionModelConfig` (see progressionModels.ts) and its own
 * logged history.
 *
 * PRECEDENCE (spec §12): a caller applying this decision to a resolved workout must
 * still respect, in order: SAFETY CONSTRAINT > READINESS CONSTRAINT > this decision >
 * BASE PROGRESSION TEMPLATE. This engine itself only ever reads readiness as *context*
 * for interpreting evidence (§8) — it never overrides an injury/safety substitution,
 * which happens upstream in planEngine.resolveExercise before progression is ever applied.
 */

/** RIR at/above this on a fully-completed exposure supports progressing — "comfortably
 * above target". */
export const RIR_PROGRESS_THRESHOLD = 2;
/** RIR at/below this on a fully-completed exposure supports holding/regressing —
 * effectively training to or near failure. Strictly between the two thresholds counts
 * as "around target" -> maintain. */
export const RIR_REGRESS_THRESHOLD = 0;
/** Consecutive struggle exposures (under normal/high readiness) required before a
 * REGRESS is proposed — a single bad session only ever holds (spec §13). */
export const CONSECUTIVE_STRUGGLES_FOR_REGRESS = 2;
/** Trailing consecutive successful exposures required for 'high' confidence. */
export const MIN_EXPOSURES_FOR_HIGH_CONFIDENCE = 3;
/** Relative step applied to distance/duration models on progress/regress. */
export const CONDITIONING_PROGRESSION_STEP_PCT = 0.1;
const DISTANCE_ROUND_STEP_M = 25;
const DURATION_ROUND_STEP_SEC = 5;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToStep(value: number, step: number): number {
  return Math.max(0, Math.round(value / step) * step);
}

/** How much of a prescribed exposure was actually done — derived fresh every time
 * from the log's own set counts, never stored redundantly. */
export function classifyCompletion(log: ExercisePerformanceLog): 'full' | 'partial' | 'missed' {
  if (log.prescribedSets <= 0) return log.completedSets > 0 ? 'full' : 'missed';
  const ratio = log.completedSets / log.prescribedSets;
  if (ratio <= 0) return 'missed';
  if (ratio >= 1) return 'full';
  return 'partial';
}

type FullCompletionSignal = 'progress' | 'maintain' | 'struggle' | 'unknown';

/** What a single fully-completed exposure's RIR says about readiness to progress.
 * 'unknown' when RIR wasn't logged — completion alone is still positive evidence,
 * just weaker (never treated as equivalent to a confirmed easy exposure). */
function evaluateFullCompletion(log: ExercisePerformanceLog): FullCompletionSignal {
  if (log.rir === undefined) return 'unknown';
  if (log.rir >= RIR_PROGRESS_THRESHOLD) return 'progress';
  if (log.rir <= RIR_REGRESS_THRESHOLD) return 'struggle';
  return 'maintain';
}

/** The target a logged exposure represents, reconstructed from what was achieved
 * (this app logs one representative achievement per exercise per day, not a
 * separately-stored "prescribed" value — a full completion's achieved figures ARE
 * that day's effective target). */
function targetFromLog(log: ExercisePerformanceLog, config: ProgressionModelConfig): ProgressionTarget {
  switch (config.model) {
    case 'load':
      return { sets: log.prescribedSets, reps: log.repsAchieved ?? config.repFloor, loadKg: log.loadKg };
    case 'rep_range':
      return { sets: log.prescribedSets, reps: log.repsAchieved ?? config.repFloor };
    case 'distance':
      return { sets: log.prescribedSets, distanceM: log.distanceM };
    case 'duration':
      return { sets: log.prescribedSets, durationSec: log.durationSec };
    case 'technique':
      return { sets: log.prescribedSets };
  }
}

function progressTarget(prev: ProgressionTarget, config: ProgressionModelConfig): ProgressionTarget {
  switch (config.model) {
    case 'load': {
      const reps = prev.reps ?? config.repFloor ?? 0;
      const ceiling = config.repCeiling ?? reps;
      if (reps < ceiling) return { ...prev, reps: reps + 1 };
      if (prev.loadKg === undefined) return prev; // no logged load to increment from — hold until one is logged
      const increment = config.loadIncrementKg ?? DEFAULT_LOAD_INCREMENT_KG;
      return { sets: prev.sets, reps: config.repFloor, loadKg: round1(prev.loadKg + increment) };
    }
    case 'rep_range': {
      const reps = prev.reps ?? config.repFloor ?? 0;
      const ceiling = config.repCeiling ?? reps;
      return { ...prev, reps: Math.min(ceiling, reps + 1) };
    }
    case 'distance': {
      const dist = prev.distanceM;
      if (dist === undefined) return prev;
      return { sets: prev.sets, distanceM: roundToStep(dist * (1 + CONDITIONING_PROGRESSION_STEP_PCT), DISTANCE_ROUND_STEP_M) };
    }
    case 'duration': {
      const dur = prev.durationSec;
      if (dur === undefined) return prev;
      return { sets: prev.sets, durationSec: roundToStep(dur * (1 + CONDITIONING_PROGRESSION_STEP_PCT), DURATION_ROUND_STEP_SEC) };
    }
    case 'technique':
      return prev;
  }
}

function regressTarget(prev: ProgressionTarget, config: ProgressionModelConfig): ProgressionTarget {
  switch (config.model) {
    case 'load': {
      const reps = prev.reps ?? config.repFloor ?? 0;
      const floor = config.repFloor ?? reps;
      if (reps > floor) return { ...prev, reps: reps - 1 };
      if (prev.loadKg === undefined) return prev;
      const increment = config.loadIncrementKg ?? DEFAULT_LOAD_INCREMENT_KG;
      return { sets: prev.sets, reps: config.repCeiling, loadKg: round1(Math.max(0, prev.loadKg - increment)) };
    }
    case 'rep_range': {
      const reps = prev.reps ?? config.repFloor ?? 0;
      const floor = config.repFloor ?? reps;
      return { ...prev, reps: Math.max(floor, reps - 1) };
    }
    case 'distance': {
      const dist = prev.distanceM;
      if (dist === undefined) return prev;
      return { sets: prev.sets, distanceM: roundToStep(dist * (1 - CONDITIONING_PROGRESSION_STEP_PCT), DISTANCE_ROUND_STEP_M) };
    }
    case 'duration': {
      const dur = prev.durationSec;
      if (dur === undefined) return prev;
      return { sets: prev.sets, durationSec: roundToStep(dur * (1 - CONDITIONING_PROGRESSION_STEP_PCT), DURATION_ROUND_STEP_SEC) };
    }
    case 'technique':
      return prev;
  }
}

/** Counts the trailing streak of consecutive, fully-completed, non-struggle exposures
 * (most recent first) — the evidence-consistency check spec §7 asks for. Stops at the
 * first missed/partial/struggle exposure. */
function trailingConsistentStreak(history: ExercisePerformanceLog[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const log = history[i];
    if (classifyCompletion(log) !== 'full') break;
    if (evaluateFullCompletion(log) === 'struggle') break;
    streak++;
  }
  return streak;
}

function confidenceFor(streak: number, latestSignalKnown: boolean): ProgressionConfidence {
  if (!latestSignalKnown) return 'low';
  if (streak >= MIN_EXPOSURES_FOR_HIGH_CONFIDENCE) return 'high';
  if (streak >= 2) return 'medium';
  return 'medium';
}

function holdDecision(
  exerciseName: string,
  config: ProgressionModelConfig,
  previousTarget: ProgressionTarget | null,
  reason: string,
  exposureCount: number
): ExerciseProgressionDecision {
  return {
    exerciseName,
    decision: 'HOLD',
    model: config.model,
    nextTarget: previousTarget,
    previousTarget,
    reason,
    exposureCount,
    confidence: 'low',
  };
}

/**
 * Decides how the next exposure to one exercise should progress, from its inferred
 * model and its own logged history (ascending by date, most recent last — pre-filtered
 * by the caller to this exact exercise name, matching the barrierEngine/computeWeekSummary
 * convention of taking already-scoped evidence).
 *
 * `getReadinessStatus` looks up the Daily Readiness status for a given date, if any —
 * used only to keep a low-readiness day's underperformance from being treated as
 * genuine regression evidence (spec §8), never to override safety.
 */
export function decideExerciseProgression(
  exerciseName: string,
  config: ProgressionModelConfig | null,
  baseTarget: ProgressionTarget,
  history: ExercisePerformanceLog[],
  getReadinessStatus: (date: string) => ReadinessStatus | null
): ExerciseProgressionDecision {
  if (!config) {
    return {
      exerciseName,
      decision: 'SKIP',
      model: 'technique',
      nextTarget: null,
      previousTarget: null,
      reason: 'This block is not progressed.',
      exposureCount: 0,
      confidence: 'low',
    };
  }

  if (history.length === 0) {
    return {
      exerciseName,
      decision: 'SKIP',
      model: config.model,
      nextTarget: baseTarget,
      previousTarget: null,
      reason: "No prior history for this exercise yet — using the plan's base target.",
      exposureCount: 0,
      confidence: 'low',
    };
  }

  const latest = history[history.length - 1];
  const previousTarget = targetFromLog(latest, config);
  const quality = classifyCompletion(latest);

  if (quality === 'missed') {
    return holdDecision(exerciseName, config, previousTarget, 'Held because your last session for this exercise was missed.', 0);
  }

  if (quality === 'partial') {
    const readiness = getReadinessStatus(latest.date);
    if (readiness === 'reduced' || readiness === 'recovery') {
      return holdDecision(
        exerciseName,
        config,
        previousTarget,
        "Held because today's readiness was reduced during your last attempt — your previous target is preserved rather than penalized.",
        0
      );
    }
    return holdDecision(
      exerciseName,
      config,
      previousTarget,
      `Held because you completed only ${latest.completedSets} of ${latest.prescribedSets} prescribed sets last time.`,
      0
    );
  }

  // quality === 'full'
  if (config.model === 'technique') {
    return {
      exerciseName,
      decision: 'MAINTAIN',
      model: 'technique',
      nextTarget: previousTarget,
      previousTarget,
      reason: 'Maintained — this is technique/skill work, built through consistency rather than added load or volume.',
      exposureCount: trailingConsistentStreak(history),
      confidence: 'medium',
    };
  }

  const signal = evaluateFullCompletion(latest);

  if (signal === 'struggle') {
    const readiness = getReadinessStatus(latest.date);
    if (readiness === 'reduced' || readiness === 'recovery') {
      return holdDecision(
        exerciseName,
        config,
        previousTarget,
        "Held because today's readiness was reduced during your last exposure — your previous target is preserved rather than reduced.",
        0
      );
    }

    let consecutiveStruggles = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const log = history[i];
      if (classifyCompletion(log) !== 'full' || evaluateFullCompletion(log) !== 'struggle') break;
      const logReadiness = getReadinessStatus(log.date);
      if (logReadiness === 'reduced' || logReadiness === 'recovery') break; // a suppressed exposure breaks the streak
      consecutiveStruggles++;
    }

    if (consecutiveStruggles >= CONSECUTIVE_STRUGGLES_FOR_REGRESS) {
      return {
        exerciseName,
        decision: 'REGRESS',
        model: config.model,
        nextTarget: regressTarget(previousTarget, config),
        previousTarget,
        reason: `Regressed after ${consecutiveStruggles} consecutive sessions at or below your target reps in reserve, under normal readiness.`,
        exposureCount: consecutiveStruggles,
        confidence: consecutiveStruggles >= MIN_EXPOSURES_FOR_HIGH_CONFIDENCE ? 'high' : 'medium',
      };
    }

    return {
      exerciseName,
      decision: 'MAINTAIN',
      model: config.model,
      nextTarget: previousTarget,
      previousTarget,
      reason: 'Maintained — your last exposure was at your limit (low reps in reserve), holding here before regressing.',
      exposureCount: consecutiveStruggles,
      confidence: 'medium',
    };
  }

  if (signal === 'maintain') {
    return {
      exerciseName,
      decision: 'MAINTAIN',
      model: config.model,
      nextTarget: previousTarget,
      previousTarget,
      reason: 'Maintained — your last exposure was right around target effort.',
      exposureCount: trailingConsistentStreak(history),
      confidence: 'medium',
    };
  }

  // signal === 'progress' or 'unknown' — check the exposure immediately before this
  // one for contradicting evidence (spec §7: one noisy session should not, by itself,
  // override a preceding struggle).
  const priorIndex = history.length - 2;
  const prior = priorIndex >= 0 ? history[priorIndex] : null;
  const priorContradicts = prior !== null && classifyCompletion(prior) === 'full' && evaluateFullCompletion(prior) === 'struggle';

  if (priorContradicts) {
    return {
      exerciseName,
      decision: 'MAINTAIN',
      model: config.model,
      nextTarget: previousTarget,
      previousTarget,
      reason: 'Maintained — your most recent exposure was strong, but the one before it was a struggle, so holding for one more consistent session before progressing.',
      exposureCount: 1,
      confidence: 'low',
    };
  }

  const streak = trailingConsistentStreak(history);
  const nextTarget = progressTarget(previousTarget, config);
  const reason =
    signal === 'unknown'
      ? "Progressed based on full completion (reps in reserve wasn't logged, so this uses completion-only evidence)."
      : `Progressed because you completed the target with ${latest.rir} reps in reserve.`;

  return {
    exerciseName,
    decision: 'PROGRESS',
    model: config.model,
    nextTarget,
    previousTarget,
    reason,
    exposureCount: streak,
    confidence: confidenceFor(streak, signal !== 'unknown'),
  };
}
