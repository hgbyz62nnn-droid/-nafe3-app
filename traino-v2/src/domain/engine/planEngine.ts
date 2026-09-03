import { getSportModule } from '../sports/registry';
import type { AiCoachAdjustment, ExerciseSlot, UserProfile, WorkoutDayTemplate } from './types';
import { applyProgression } from './progressionEngine';
import { isValidWeekNumber } from './validation';

export interface ResolvedExercise {
  name: string;
  sets: number;
  reps: string;
  restSec?: number;
  category: ExerciseSlot['category'];
  /** Why the displayed name/reps differ from the slot's primary movement, if at all. */
  substitutionReason: 'none' | 'equipment' | 'location' | 'injury' | 'adjustment';
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
}

function resolveExercise(slot: ExerciseSlot, ctx: ResolveContext): ResolvedExercise | null {
  if (ctx.skipHighImpact && slot.highImpact) {
    return null;
  }

  const missingEquipment = slot.equipment.length > 0 && !slot.equipment.some((id) => ctx.equipmentIds.includes(id));
  const wrongLocation =
    (slot.locations ?? []).length > 0 && !slot.locations!.some((loc) => ctx.locationIds.includes(loc));
  const injuryFlagged = (slot.contraindications ?? []).some((tag) => ctx.injuryIds.includes(tag));
  const shouldSubstitute = ctx.forceBodyweight || missingEquipment || wrongLocation || injuryFlagged;

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

function baseContext(profile: UserProfile, weekNumber = 1): ResolveContext {
  // A NaN/negative/non-integer week number (corrupt state, a bad progression calc) must
  // never reach applyProgression's arithmetic — it would propagate as a NaN set count.
  const safeWeekNumber = isValidWeekNumber(weekNumber) ? weekNumber : 1;
  return {
    equipmentIds: profile.answers.equipmentIds,
    locationIds: profile.answers.trainingLocationIds,
    injuryIds: profile.answers.injuryIds,
    weekNumber: safeWeekNumber,
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
export function generateTodayWorkout(profile: UserProfile, dayIndex?: number, weekNumber = 1): ResolvedWorkout {
  return resolveDay(dayForIndex(profile, dayIndex), baseContext(profile, weekNumber));
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
  weekNumber = 1
): ResolvedWorkout {
  const day = dayForIndex(profile, dayIndex);

  const ctx: ResolveContext = {
    ...baseContext(profile, weekNumber),
    forceBodyweight: adjustment.swapToBodyweight,
    skipHighImpact: adjustment.skipHighImpact,
  };

  const resolved = resolveDay(day, ctx);

  const multiplier = adjustment.volumeMultiplier;
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
