import { getSportModule } from '../sports/registry';
import type { AiCoachAdjustment, ExerciseSlot, UserProfile, WorkoutDayTemplate } from './types';
import type { ExerciseProgressionDecision } from '../progression/types';
import { applyProgression } from './progressionEngine';
import { applyExerciseProgression, type ExerciseProgressionContext } from './progressionIntegration';
import { isValidWeekNumber } from './validation';

export interface ResolvedExercise {
  name: string;
  sets: number;
  reps: string;
  restSec?: number;
  category: ExerciseSlot['category'];
  /** Why the displayed name/reps differ from the slot's primary movement, if at all. */
  substitutionReason: 'none' | 'equipment' | 'location' | 'injury' | 'adjustment' | 'travel' | 'competition';
  /** The slot's original, pre-substitution movement name — set whenever
   * `substitutionReason !== 'none'`. Used for logging ("original exercise" vs
   * "actual exercise", spec §19) and by domain/context/travelEngine.ts to find a
   * richer Exercise-Intelligence-driven alternative than the authored
   * bodyweightAlternative when a partial equipment subset (not pure bodyweight)
   * is available. */
  sourceSlotName?: string;
  /** Present only when a `ResolveContext.progression` was supplied and this block is
   * progressable (not warmup/cooldown) — the structured decision behind `reps` above,
   * for the AI Coach / Progress screen / "why" UI. Evidence is always attached to this
   * exercise's own name (post-substitution), never the original contraindicated slot. */
  progression?: ExerciseProgressionDecision;
}

export interface ResolvedWorkout {
  id: string;
  name: string;
  focus: string;
  intensity: WorkoutDayTemplate['intensity'];
  durationMin: number;
  statCategory: WorkoutDayTemplate['statCategory'];
  exercises: ResolvedExercise[];
}

interface ResolveContext {
  equipmentIds: string[];
  locationIds: string[];
  injuryIds: string[];
  /** From an applied AI Coach adjustment — always prefer the bodyweight version. */
  forceBodyweight?: boolean;
  /** From an applied AI Coach adjustment — drop high-impact movements entirely. */
  skipHighImpact?: boolean;
  weekNumber?: number;
  /** Optional: when supplied, each resolvable exercise's target reps/load/duration/distance
   * is set by the Progression Engine (see progressionIntegration.ts) instead of the plan's
   * raw authored value — the calendar-block `applyProgression` below still runs regardless. */
  progression?: ExerciseProgressionContext;
}

function resolveExercise(slot: ExerciseSlot, ctx: ResolveContext): ResolvedExercise | null {
  if (ctx.skipHighImpact && slot.highImpact) {
    return null;
  }

  const missingEquipment = slot.equipment.length > 0 && !slot.equipment.some((id) => ctx.equipmentIds.includes(id));
  const wrongLocation =
    (slot.locations ?? []).length > 0 && !slot.locations!.some((loc) => ctx.locationIds.includes(loc));
  const injuryFlagged = (slot.contraindications ?? []).some((tag) => ctx.injuryIds.includes(tag));
  // A "prefer bodyweight" adjustment (traveling, pain-safe, weekly-coaching equipment/travel
  // recommendations) only means anything for a slot that actually requires equipment or a
  // specific location — an already-equipment-free, location-unconstrained slot (Warm Up,
  // Cool Down, or any bodyweight exercise) has nothing to swap away from and must never be
  // dropped just because forceBodyweight is set.
  const forceBodyweightApplies = ctx.forceBodyweight && (slot.equipment.length > 0 || (slot.locations?.length ?? 0) > 0);
  const shouldSubstitute = forceBodyweightApplies || missingEquipment || wrongLocation || injuryFlagged;

  if (shouldSubstitute && !slot.bodyweightAlternative) {
    // No safe/available substitute exists for this slot — drop it rather than
    // emit the original movement (which is either unavailable/infeasible, or
    // for an injury match, exactly the movement the athlete should be avoiding).
    return null;
  }

  let base: ResolvedExercise;
  if (shouldSubstitute && slot.bodyweightAlternative) {
    const reason: ResolvedExercise['substitutionReason'] = injuryFlagged
      ? 'injury'
      : missingEquipment
        ? 'equipment'
        : wrongLocation
          ? 'location'
          : 'adjustment';
    base = {
      name: slot.bodyweightAlternative.name,
      sets: slot.sets,
      reps: slot.bodyweightAlternative.reps,
      restSec: slot.restSec,
      category: slot.category,
      substitutionReason: reason,
      sourceSlotName: slot.name,
    };
  } else {
    base = {
      name: slot.name,
      sets: slot.sets,
      reps: slot.reps,
      restSec: slot.restSec,
      category: slot.category,
      substitutionReason: 'none',
    };
  }

  if (ctx.progression) {
    // Model inference reads whatever's actually being resolved today — the substitute's
    // own reps/category and its equipment (bodyweightAlternative is always equipment-free
    // by contract), never the original slot when a substitution occurred. Evidence and the
    // resulting target stay attached to `base.name`, so a knee-safe substitute's history
    // can never be used to progress — or reintroduce — the original contraindicated move.
    const equipmentForModel = shouldSubstitute && slot.bodyweightAlternative ? [] : slot.equipment;
    const progressed = applyExerciseProgression(base, equipmentForModel, ctx.progression);
    if (progressed) {
      base = { ...base, reps: progressed.reps, progression: progressed.decision };
    }
  }

  return ctx.weekNumber ? applyProgression(base, ctx.weekNumber) : base;
}

function resolveDay(day: WorkoutDayTemplate, ctx: ResolveContext): ResolvedWorkout {
  const exercises = day.exercises
    .map((slot) => resolveExercise(slot, ctx))
    .filter((ex): ex is ResolvedExercise => ex !== null);

  return {
    id: day.id,
    name: day.name,
    focus: day.focus,
    intensity: day.intensity,
    durationMin: day.durationMin,
    statCategory: day.statCategory,
    exercises,
  };
}

function baseContext(profile: UserProfile, weekNumber = 1, progression?: ExerciseProgressionContext): ResolveContext {
  // A NaN/negative/non-integer week number (corrupt state, a bad progression calc) must
  // never reach applyProgression's arithmetic — it would propagate as a NaN set count.
  const safeWeekNumber = isValidWeekNumber(weekNumber) ? weekNumber : 1;
  return {
    equipmentIds: profile.answers.equipmentIds,
    locationIds: profile.answers.trainingLocationIds,
    injuryIds: profile.answers.injuryIds,
    weekNumber: safeWeekNumber,
    progression,
  };
}

/**
 * Which day of a weekly program cycle "today" is — a pure function of
 * the real calendar (ISO weekday, Monday=0) modulo the program's length,
 * so the plan actually rotates day to day instead of always showing the
 * first template.
 */
export function todayDayIndex(programLength: number, date: Date = new Date()): number {
  const isoWeekday = (date.getDay() + 6) % 7; // Mon=0 .. Sun=6
  return isoWeekday % programLength;
}

function dayForIndex(profile: UserProfile, dayIndex?: number): WorkoutDayTemplate {
  const sportModule = getSportModule(profile.answers.sport);
  const days = sportModule.program[profile.level];
  const index = dayIndex ?? todayDayIndex(days.length);
  return days[index % days.length];
}

/** The full weekly cycle for the athlete's sport/level, equipment- and injury-resolved, in order. */
export function generateWeekProgram(profile: UserProfile, weekNumber = 1): ResolvedWorkout[] {
  const sportModule = getSportModule(profile.answers.sport);
  const days = sportModule.program[profile.level];
  const ctx = baseContext(profile, weekNumber);
  return days.map((day) => resolveDay(day, ctx));
}

/**
 * Today's workout, cycling deterministically through the weekly program
 * by real day-of-week rather than picking randomly. Pass `dayIndex`
 * explicitly to look at a specific day of the cycle (e.g. for the
 * history behind Progress/Weekly Report); omit it to mean "today".
 */
export function generateTodayWorkout(
  profile: UserProfile,
  dayIndex?: number,
  weekNumber = 1,
  progression?: ExerciseProgressionContext
): ResolvedWorkout {
  return resolveDay(dayForIndex(profile, dayIndex), baseContext(profile, weekNumber, progression));
}

/** Scales every non-warmup/cooldown block's sets by `multiplier` (a no-op for an
 * invalid/absent multiplier) — the one place volume-scaling math lives, shared by
 * `applyCoachAdjustment` and `generateContextAdjustedWorkout` below rather than
 * duplicated between them. */
function applyVolumeMultiplier(resolved: ResolvedWorkout, multiplier: number | undefined): ResolvedWorkout {
  if (!multiplier || Number.isNaN(multiplier) || multiplier <= 0) return resolved;
  return {
    ...resolved,
    exercises: resolved.exercises.map((ex) =>
      ex.category === 'warmup' || ex.category === 'cooldown'
        ? ex
        : { ...ex, sets: Math.max(1, Math.round(ex.sets * multiplier)) }
    ),
  };
}

/**
 * Applies a deterministic AI Coach adjustment (see aiCoachEngine.ts) to
 * today's workout — forcing bodyweight substitutions, dropping
 * high-impact movements, and/or scaling volume — rather than just
 * describing the change as text.
 */
export function applyCoachAdjustment(
  profile: UserProfile,
  dayIndex: number | undefined,
  adjustment: AiCoachAdjustment,
  weekNumber = 1,
  progression?: ExerciseProgressionContext
): ResolvedWorkout {
  const day = dayForIndex(profile, dayIndex);

  const ctx: ResolveContext = {
    ...baseContext(profile, weekNumber, progression),
    forceBodyweight: adjustment.swapToBodyweight,
    skipHighImpact: adjustment.skipHighImpact,
  };

  return applyVolumeMultiplier(resolveDay(day, ctx), adjustment.volumeMultiplier);
}

/** Overrides for a temporary Training Context (Travel/Competition, see
 * domain/context/) resolving today's workout — reuses the exact same
 * `ResolveContext`/`resolveDay` substitution machinery `generateTodayWorkout`
 * and `applyCoachAdjustment` already use, just with equipment/location
 * overridden instead of read straight from the athlete's stored profile. */
export interface ContextOverride {
  /** Temporary equipment available for the duration of the context — replaces
   * `profile.answers.equipmentIds` for this resolution only; the stored
   * profile is never mutated. */
  equipmentIds?: string[];
  locationIds?: string[];
  adjustment?: AiCoachAdjustment;
}

export function generateContextAdjustedWorkout(
  profile: UserProfile,
  dayIndex: number | undefined,
  override: ContextOverride,
  weekNumber = 1,
  progression?: ExerciseProgressionContext
): ResolvedWorkout {
  const day = dayForIndex(profile, dayIndex);

  const ctx: ResolveContext = {
    ...baseContext(profile, weekNumber, progression),
    equipmentIds: override.equipmentIds ?? profile.answers.equipmentIds,
    locationIds: override.locationIds ?? profile.answers.trainingLocationIds,
    forceBodyweight: override.adjustment?.swapToBodyweight,
    skipHighImpact: override.adjustment?.skipHighImpact,
  };

  return applyVolumeMultiplier(resolveDay(day, ctx), override.adjustment?.volumeMultiplier);
}
