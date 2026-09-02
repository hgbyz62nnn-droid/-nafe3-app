import type { ExerciseCategory } from './types';

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
