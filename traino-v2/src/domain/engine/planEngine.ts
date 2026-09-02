import { getSportModule } from '../sports/registry';
import type { ExerciseSlot, UserProfile, WorkoutDayTemplate } from './types';

export interface ResolvedExercise {
  name: string;
  sets: number;
  reps: string;
  restSec?: number;
  category: ExerciseSlot['category'];
  /** True when the equipment-preferred version wasn't available and the bodyweight alternative was substituted. */
  substituted: boolean;
}

export interface ResolvedWorkout {
  id: string;
  name: string;
  focus: string;
  intensity: WorkoutDayTemplate['intensity'];
  durationMin: number;
  exercises: ResolvedExercise[];
}

/** Picks the exercise's real name/reps given what equipment the athlete actually has. */
function resolveExercise(slot: ExerciseSlot, availableEquipmentIds: string[]): ResolvedExercise {
  const needsEquipment = slot.equipment.length > 0;
  const hasEquipment = slot.equipment.some((id) => availableEquipmentIds.includes(id));

  if (needsEquipment && !hasEquipment && slot.bodyweightAlternative) {
    return {
      name: slot.bodyweightAlternative.name,
      sets: slot.sets,
      reps: slot.bodyweightAlternative.reps,
      restSec: slot.restSec,
      category: slot.category,
      substituted: true,
    };
  }

  return {
    name: slot.name,
    sets: slot.sets,
    reps: slot.reps,
    restSec: slot.restSec,
    category: slot.category,
    substituted: false,
  };
}

function resolveDay(day: WorkoutDayTemplate, availableEquipmentIds: string[]): ResolvedWorkout {
  return {
    id: day.id,
    name: day.name,
    focus: day.focus,
    intensity: day.intensity,
    durationMin: day.durationMin,
    exercises: day.exercises.map((slot) => resolveExercise(slot, availableEquipmentIds)),
  };
}

/** The full weekly cycle for the athlete's sport/level, equipment-resolved, in order. */
export function generateWeekProgram(profile: UserProfile): ResolvedWorkout[] {
  const sportModule = getSportModule(profile.answers.sport);
  const days = sportModule.program[profile.level];
  return days.map((day) => resolveDay(day, profile.answers.equipmentIds));
}

/**
 * Today's workout, cycling deterministically through the weekly program
 * by day-of-cycle rather than picking randomly.
 */
export function generateTodayWorkout(profile: UserProfile, dayIndex: number): ResolvedWorkout {
  const week = generateWeekProgram(profile);
  return week[dayIndex % week.length];
}

/** Deterministic "which day of the cycle is today" from a fixed weekly start plus elapsed days. */
export function currentDayIndex(cycleStart: Date, today: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((today.getTime() - cycleStart.getTime()) / msPerDay);
  return Math.max(diffDays, 0);
}
