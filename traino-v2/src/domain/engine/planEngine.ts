import { getSportModule } from '../sports/registry';
import type { AiCoachAdjustment, ExerciseSlot, UserProfile, WorkoutDayTemplate } from './types';
import { applyProgression } from './progressionEngine';

export interface ResolvedExercise {
  name: string;
  sets: number;
  reps: string;
  restSec?: number;
  category: ExerciseSlot['category'];
  /** Why the displayed name/reps differ from the slot's primary movement, if at all. */
  substitutionReason: 'none' | 'equipment' | 'injury' | 'adjustment';
}

export interface ResolvedWorkout {
  id: string;
  name: string;
  focus: string;
  intensity: WorkoutDayTemplate['intensity'];
  durationMin: number;
  exercises: ResolvedExercise[];
}

interface ResolveContext {
  equipmentIds: string[];
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
  const injuryFlagged = (slot.contraindications ?? []).some((tag) => ctx.injuryIds.includes(tag));
  const shouldSubstitute = ctx.forceBodyweight || missingEquipment || injuryFlagged;

  const base =
    shouldSubstitute && slot.bodyweightAlternative
      ? {
          name: slot.bodyweightAlternative.name,
          sets: slot.sets,
          reps: slot.bodyweightAlternative.reps,
          restSec: slot.restSec,
          category: slot.category,
          substitutionReason: (injuryFlagged ? 'injury' : missingEquipment ? 'equipment' : 'adjustment') as const,
        }
      : {
          name: slot.name,
          sets: slot.sets,
          reps: slot.reps,
          restSec: slot.restSec,
          category: slot.category,
          substitutionReason: 'none' as const,
        };

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
    exercises,
  };
}

function baseContext(profile: UserProfile, weekNumber = 1): ResolveContext {
  return {
    equipmentIds: profile.answers.equipmentIds,
    injuryIds: profile.answers.injuryIds,
    weekNumber,
  };
}

/** The full weekly cycle for the athlete's sport/level, equipment- and injury-resolved, in order. */
export function generateWeekProgram(profile: UserProfile, weekNumber = 1): ResolvedWorkout[] {
  const sportModule = getSportModule(profile.answers.sport);
  const days = sportModule.program[profile.level];
  const ctx = baseContext(profile, weekNumber);
  return days.map((day) => resolveDay(day, ctx));
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

/**
 * Today's workout, cycling deterministically through the weekly program
 * by real day-of-week rather than picking randomly. Pass `dayIndex`
 * explicitly to look at a specific day of the cycle (e.g. for the
 * history behind Progress/Weekly Report); omit it to mean "today".
 */
export function generateTodayWorkout(profile: UserProfile, dayIndex?: number, weekNumber = 1): ResolvedWorkout {
  const sportModule = getSportModule(profile.answers.sport);
  const days = sportModule.program[profile.level];
  const index = dayIndex ?? todayDayIndex(days.length);
  const day = days[index % days.length];
  return resolveDay(day, baseContext(profile, weekNumber));
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
  const sportModule = getSportModule(profile.answers.sport);
  const days = sportModule.program[profile.level];
  const index = dayIndex ?? todayDayIndex(days.length);
  const day = days[index % days.length];

  const ctx: ResolveContext = {
    ...baseContext(profile, weekNumber),
    forceBodyweight: adjustment.swapToBodyweight,
    skipHighImpact: adjustment.skipHighImpact,
  };

  const resolved = resolveDay(day, ctx);

  if (!adjustment.volumeMultiplier) return resolved;

  const multiplier = adjustment.volumeMultiplier;
  return {
    ...resolved,
    exercises: resolved.exercises.map((ex) =>
      ex.category === 'warmup' || ex.category === 'cooldown'
        ? ex
        : { ...ex, sets: Math.max(1, Math.round(ex.sets * multiplier)) }
    ),
  };
}
