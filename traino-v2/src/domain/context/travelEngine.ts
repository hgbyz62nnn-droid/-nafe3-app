import type { ResolvedExercise, ResolvedWorkout } from '../engine/planEngine';
import { generateContextAdjustedWorkout } from '../engine/planEngine';
import type { AiCoachAdjustment, UserProfile } from '../engine/types';
import type { ExerciseProgressionContext } from '../engine/progressionIntegration';
import { getExerciseByName } from '../exercise/registry';
import { suggestReplacements, type AthleteConstraints } from '../exercise/matchingEngine';
import type { TravelConstraints } from './types';

/**
 * Travel Mode training resolution (spec §3-§6/§17). Reuses, in order:
 *   1. planEngine's existing ResolveContext/resolveDay machinery, with the
 *      athlete's TEMPORARY travel equipment/location swapped in for the
 *      duration of the context (never touching the stored profile) —
 *      `generateContextAdjustedWorkout`.
 *   2. The Exercise Intelligence matching engine, to upgrade any
 *      equipment/location fallback beyond the single authored
 *      `bodyweightAlternative` when a real (non-empty) equipment subset is
 *      available — e.g. dumbbells-only travel should get a dumbbell
 *      variation, not necessarily the full bodyweight substitute.
 *   3. Deterministic time-based session compression (never positional
 *      truncation) down to `constraints.time.minutesAvailable`.
 * Nothing here hardcodes a specific exercise-name mapping or branches on sport.
 */

/** Only apply the Exercise-Intelligence upgrade when the travel equipment set
 * is a genuine, non-empty PARTIAL subset — a pure bodyweight-only preset has
 * nothing better to offer than the already-correct bodyweightAlternative. */
function enrichWithExerciseIntelligence(workout: ResolvedWorkout, travel: TravelConstraints, baseConstraints: AthleteConstraints): ResolvedWorkout {
  if (travel.equipmentIds.length === 0) return workout;

  const exercises = workout.exercises.map((ex): ResolvedExercise => {
    if ((ex.substitutionReason !== 'equipment' && ex.substitutionReason !== 'location') || !ex.sourceSlotName) return ex;

    const source = getExerciseByName(ex.sourceSlotName);
    if (!source) return ex;

    const candidates = suggestReplacements(source.id, { ...baseConstraints, availableEquipment: travel.equipmentIds }, 1);
    const top = candidates[0];
    if (!top) return ex; // no compatible alternative for this subset — keep the safe bodyweight fallback

    return { ...ex, name: top.exercise.displayName, substitutionReason: 'travel' };
  });

  return { ...workout, exercises };
}

/** Deterministic time-per-block estimate — a planning heuristic, not a lab
 * measurement, documented so the compression rule below is auditable. */
const WORK_SECONDS_PER_SET = 40;
const DEFAULT_REST_SECONDS = 60;
const WARMUP_COOLDOWN_MINUTES = 5;

function estimateMinutes(ex: ResolvedExercise): number {
  if (ex.category === 'warmup' || ex.category === 'cooldown') return WARMUP_COOLDOWN_MINUTES;
  const restSec = ex.restSec ?? DEFAULT_REST_SECONDS;
  return Math.max(1, Math.round((ex.sets * (WORK_SECONDS_PER_SET + restSec)) / 60));
}

/** Priority tier for what to keep first when the session must be compressed
 * (spec §6: warm-up > primary training intent > highest-value exercises >
 * accessory work > cooldown) — higher score is dropped LAST. Authored order
 * within the main block is used as the value proxy (compound/primary work is
 * conventionally authored first), never an exercise-name-specific rule. */
function keepPriority(ex: ResolvedExercise, mainBlockIndex: number): number {
  if (ex.category === 'warmup') return 1000;
  if (ex.category === 'cooldown') return 0;
  return 500 - mainBlockIndex; // earlier main-block exercise = higher priority
}

/**
 * Compresses a resolved workout to fit `minutesAvailable`, dropping the
 * LOWEST-priority blocks first (cooldown, then later accessory work) rather
 * than truncating positionally — the first main-block exercise (the primary
 * training intent) and, while any budget remains, the warmup are never
 * dropped. `durationMin` on the result reflects the real remaining estimated
 * time, never the original session's authored duration.
 */
export function compressWorkoutToTimeBudget(workout: ResolvedWorkout, minutesAvailable: number): ResolvedWorkout {
  if (!Number.isFinite(minutesAvailable) || minutesAvailable <= 0) return workout;

  let mainBlockIndex = -1;
  const withPriority = workout.exercises.map((ex) => {
    const isMainBlock = ex.category !== 'warmup' && ex.category !== 'cooldown';
    if (isMainBlock) mainBlockIndex += 1;
    return { ex, priority: keepPriority(ex, isMainBlock ? mainBlockIndex : -1), minutes: estimateMinutes(ex), isMainBlock };
  });

  const totalMinutes = withPriority.reduce((sum, e) => sum + e.minutes, 0);
  if (totalMinutes <= minutesAvailable) {
    return { ...workout, durationMin: totalMinutes };
  }

  // The first main-block exercise (primary training intent) is never dropped.
  const firstMainBlockPos = withPriority.findIndex((e) => e.isMainBlock);
  const kept = [...withPriority];
  // Drop lowest-priority blocks first until within budget, protecting the primary lift.
  kept.sort((a, b) => a.priority - b.priority);
  let runningTotal = totalMinutes;
  const dropped = new Set<number>();
  for (const entry of kept) {
    if (runningTotal <= minutesAvailable) break;
    const originalIndex = withPriority.indexOf(entry);
    if (originalIndex === firstMainBlockPos) continue; // protected
    dropped.add(originalIndex);
    runningTotal -= entry.minutes;
  }

  const exercises = withPriority.filter((_, i) => !dropped.has(i)).map((e) => e.ex);
  const keptMinutes = withPriority.filter((_, i) => !dropped.has(i)).reduce((sum, e) => sum + e.minutes, 0);
  return { ...workout, exercises, durationMin: keptMinutes };
}

export interface ResolveTravelWorkoutOptions {
  dayIndex?: number;
  weekNumber?: number;
  progression?: ExerciseProgressionContext;
  /** Injury/sport/level constraints used for the Exercise Intelligence upgrade
   * pass — the same `AthleteConstraints` shape TodaysWorkout.tsx already builds. */
  athleteConstraints: AthleteConstraints;
  /** The volume/safety adjustment that won this session's precedence chain
   * (explicit AI Coach chat > readiness > weekly coaching — see
   * TodaysWorkout.tsx) composed alongside travel's equipment/location
   * override, never instead of it (spec §16: "Travel + Low Readiness ->
   * travel constraints + readiness reduction"). A pain-safety adjustment's
   * `skipHighImpact`/`swapToBodyweight` still applies even while traveling. */
  adjustment?: AiCoachAdjustment;
}

/** Full Travel Mode workout resolution — the one entry point screens/tests call. */
export function resolveTravelWorkout(profile: UserProfile, travel: TravelConstraints, options: ResolveTravelWorkoutOptions): ResolvedWorkout {
  const base = generateContextAdjustedWorkout(
    profile,
    options.dayIndex,
    { equipmentIds: travel.equipmentIds, locationIds: travel.locationIds, adjustment: options.adjustment },
    options.weekNumber ?? 1,
    options.progression
  );
  const enriched = enrichWithExerciseIntelligence(base, travel, options.athleteConstraints);
  return compressWorkoutToTimeBudget(enriched, travel.time.minutesAvailable);
}
