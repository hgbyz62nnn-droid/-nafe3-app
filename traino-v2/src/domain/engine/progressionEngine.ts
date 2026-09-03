import type { ExerciseCategory } from './types';
import { addDays, daysBetween, localDateKey, parseLocalDateKey } from './dateUtils';

/**
 * Deterministic weekly progression: a fixed block-and-cap rule, not a
 * learned or generated adjustment. Every 4-week block adds one set to
 * strength/power work, capped at +2 sets total (weeks 9+). Conditioning,
 * warmup, and cooldown blocks are left as authored.
 */
const WEEKS_PER_BLOCK = 4;
const MAX_BONUS_SETS = 2;

export function applyProgression<T extends { sets: number; category: ExerciseCategory }>(
  exercise: T,
  weekNumber: number
): T {
  if (exercise.category !== 'strength' && exercise.category !== 'power') return exercise;

  const block = Math.floor(Math.max(weekNumber - 1, 0) / WEEKS_PER_BLOCK);
  const bonusSets = Math.min(block, MAX_BONUS_SETS);
  if (bonusSets === 0) return exercise;

  return { ...exercise, sets: exercise.sets + bonusSets };
}

export interface ProgressionInfo {
  /** Echoes the input, or null if no plan has started yet (pre-assessment). */
  planStartDate: string | null;
  /** 1-indexed real-calendar week the athlete is currently in — week 1 is the 7-day span
   * starting on `planStartDate`, regardless of how many sessions were actually logged. */
  currentPlanWeek: number;
  /** 1-indexed week number fed into `applyProgression`/plan generation. Only ever advances
   * past a fully-elapsed calendar week the athlete "earned" (see EARNED_COMPLETION_RATIO);
   * a missed or under-threshold week freezes it there until the athlete catches back up,
   * so a gap in training can never itself grant heavier sets. */
  progressionWeek: number;
}

/** Fraction of the athlete's own planned weekly frequency they must have actually logged
 * for a fully-elapsed calendar week to count toward progression. */
const EARNED_COMPLETION_RATIO = 0.5;

/**
 * Derives calendar-aware progression from the athlete's real plan start date and logged
 * workout history — never from a raw count of sessions completed, so a break in training
 * (illness, travel, a skipped week) shows up as a calendar gap rather than quietly
 * un-happening. Pure function of its inputs; `today` is injectable for testing.
 */
export function computeProgressionInfo(
  planStartDate: string | null,
  logs: Array<{ date: string; workoutCompleted: boolean }>,
  plannedDaysPerWeek: number,
  today: Date = new Date()
): ProgressionInfo {
  if (!planStartDate) {
    return { planStartDate: null, currentPlanWeek: 1, progressionWeek: 1 };
  }

  const start = parseLocalDateKey(planStartDate);
  if (!start) {
    // Corrupt/malformed persisted date — fail safe to "just started", never crash or NaN.
    return { planStartDate: null, currentPlanWeek: 1, progressionWeek: 1 };
  }

  const elapsedDays = daysBetween(start, today);
  if (elapsedDays < 0) {
    // Plan start is in the future (clock skew, corrupt data) — nothing has elapsed yet.
    return { planStartDate, currentPlanWeek: 1, progressionWeek: 1 };
  }

  const currentPlanWeek = Math.floor(elapsedDays / 7) + 1;

  if (!(plannedDaysPerWeek > 0)) {
    // No frequency to judge completion against — hold at week 1 rather than divide by zero.
    return { planStartDate, currentPlanWeek, progressionWeek: 1 };
  }

  const completedByDate = new Map(logs.map((log) => [log.date, log.workoutCompleted]));
  const fullyElapsedWeeks = currentPlanWeek - 1;

  let earnedWeeks = 0;
  for (let week = 0; week < fullyElapsedWeeks; week++) {
    const weekStart = addDays(start, week * 7);
    let completed = 0;
    for (let day = 0; day < 7; day++) {
      if (completedByDate.get(localDateKey(addDays(weekStart, day)))) completed++;
    }
    const ratio = completed / plannedDaysPerWeek;
    if (ratio < EARNED_COMPLETION_RATIO) break; // stall progression until this week is made up
    earnedWeeks++;
  }

  return { planStartDate, currentPlanWeek, progressionWeek: 1 + earnedWeeks };
}
