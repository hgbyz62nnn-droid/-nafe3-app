/**
 * Progression Engine — shared types.
 *
 * The existing data model has no structured numeric prescription (`ExerciseSlot.reps`
 * is free text like "8-10" or "25m") and no per-exercise performance logging at all
 * (`DayLog` only tracks whole-workout `workoutCompleted`). Rather than rewrite the
 * authored sport data or the logging architecture, this file defines the smallest
 * generic abstraction needed on top of what already exists:
 *
 *   - `ProgressionModel` + `ProgressionModelConfig` are INFERRED from a slot's existing
 *     `reps` string and `category`/`equipment` (see progressionModels.ts) — no sport
 *     module data is authored or duplicated.
 *   - `ExercisePerformanceLog` is the one new persisted fact: what an athlete actually
 *     did for one exercise on one date. It lives inside `DayLog.exerciseLogs` (see
 *     LogContext.tsx), reusing the exact same versioned per-date persistence every
 *     other log already uses.
 *
 * Nothing here is generated — every decision downstream is table lookups and
 * arithmetic over these structured facts.
 */

/** How a given exercise slot progresses across exposures. Inferred generically from its
 * authored `reps` string/category, never from its name or the athlete's sport. */
export type ProgressionModel =
  | 'rep_range' // bodyweight reps-only work: climb reps within a window, no load to add
  | 'load' // equipment-loaded strength/power work: climb reps within a window, then add load
  | 'distance' // conditioning/swim work measured in meters
  | 'duration' // timed work measured in seconds
  | 'technique'; // skill/drill work where numeric load/volume progression is inappropriate

/** Static shape of how one exercise slot's progression window behaves — derived once
 * from its authored data, not persisted (recomputed deterministically every time). */
export interface ProgressionModelConfig {
  model: ProgressionModel;
  /** rep_range/load models: the reps window worked within before/after a load change.
   * Equal to a single authored number when no range was authored (e.g. "8" -> {8,8}). */
  repFloor?: number;
  repCeiling?: number;
  /** load model only: the increment applied when a full-range success calls for more load. */
  loadIncrementKg?: number;
}

/** One exposure's concrete prescription — what the athlete is being asked to do next,
 * or what they were asked to do on a past logged exposure. Only the fields relevant to
 * the exercise's `ProgressionModel` are populated; the rest are undefined, never 0/NaN. */
export interface ProgressionTarget {
  sets: number;
  /** rep_range/load models. */
  reps?: number;
  /** load model. */
  loadKg?: number;
  /** duration model, seconds. */
  durationSec?: number;
  /** distance model, meters. */
  distanceM?: number;
}

/** How much of the prescribed session was actually done — derived from
 * `completedSets`/`prescribedSets`, never stored redundantly. */
export type CompletionQuality = 'full' | 'partial' | 'missed';

/**
 * One real, logged exposure to one exercise on one date. Persisted inside
 * `DayLog.exerciseLogs` (see LogContext.tsx) — a new day's log creates a new entry;
 * resubmitting the same exercise on the same date replaces that entry (idempotent
 * upsert, the same pattern every other per-date log in this app already uses).
 *
 * `exerciseName` is always the exercise the athlete actually performed (post
 * equipment/location/injury/AI-Coach substitution) — never the original plan slot's
 * name when a substitution occurred. This is what keeps progression evidence honestly
 * attached to what was actually done: a knee-safe substitute's history can never be
 * used to progress — or reintroduce — the contraindicated original movement.
 */
export interface ExercisePerformanceLog {
  date: string; // YYYY-MM-DD, local calendar date
  exerciseName: string;
  prescribedSets: number;
  /** Sets actually completed, 0..prescribedSets (can exceed if the athlete did extra,
   * though nothing in this app currently prescribes that). */
  completedSets: number;
  /** Reps achieved on the hardest/last completed set — a single representative number,
   * not per-set granularity. Undefined means unknown, never assumed. */
  repsAchieved?: number;
  /** Load used in kg, for load-model exercises. Undefined means unknown. */
  loadKg?: number;
  /** Duration actually held/worked, in seconds, for duration-model exercises. */
  durationSec?: number;
  /** Distance actually covered, in meters, for distance-model exercises. */
  distanceM?: number;
  /** Reps in reserve on the hardest set (0 = failure, higher = easier). Undefined means
   * the athlete didn't report it — never defaulted to a value that implies "good" or "bad". */
  rir?: number;
  /** True when this exercise was substituted from the plan's original slot this session
   * (equipment/location/injury/AI-Coach adjustment) — evidence is still recorded under
   * the substitute's own name, this flag is for display/audit only. */
  wasModified: boolean;
  /** Set only when this session was logged under an active Travel/Competition
   * context (spec §19/§20) — undefined means a normal-context log, the same
   * "absent means nothing unusual, never a fabricated default" contract every
   * other optional log field in this app already follows. Progression evidence
   * (see TodaysWorkout.tsx's `progressionContext.getHistory`) excludes any log
   * with this set, so a context-adjusted exposure can never read back as
   * evidence the normal exercise should progress or regress. */
  contextMode?: 'travel' | 'competition';
  /** The plan's originally-scheduled exercise name, set only when different from
   * `exerciseName` (i.e. a substitution occurred) — spec §19's "original exercise
   * vs actual exercise". `wasModified` already flags THAT a substitution
   * happened; this carries what it was substituted FROM. */
  originalExerciseName?: string;
  submittedAt: string; // ISO timestamp
}

export type ProgressionDecisionType = 'PROGRESS' | 'MAINTAIN' | 'REGRESS' | 'HOLD' | 'SKIP';

export type ProgressionConfidence = 'low' | 'medium' | 'high';

/**
 * The deterministic output of the exercise-level progression engine for one exercise —
 * the answer to "how should the next exposure to this exercise progress?"
 */
export interface ExerciseProgressionDecision {
  exerciseName: string;
  decision: ProgressionDecisionType;
  /** What the exercise's model is (rep_range/load/distance/duration/technique). */
  model: ProgressionModel;
  /** The prescription to use on the NEXT exposure. Null only for SKIP (no evidence yet
   * — the plan's own base-authored target is used unchanged) or a technique model with
   * no numeric target at all. */
  nextTarget: ProgressionTarget | null;
  /** The most recent logged exposure's own prescribed target, for display ("Previous: ..."). */
  previousTarget: ProgressionTarget | null;
  /** Pre-templated, deterministic explanation — never generated. */
  reason: string;
  /** How many qualifying (full-completion, evaluable) exposures this decision is based on. */
  exposureCount: number;
  confidence: ProgressionConfidence;
}
