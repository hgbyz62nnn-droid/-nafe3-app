import type { ExerciseCategory } from './types';
import type { ExercisePerformanceLog, ExerciseProgressionDecision, ProgressionModel, ProgressionTarget } from '../progression/types';
import type { ReadinessStatus } from '../readiness/types';
import { deriveBaseTarget, inferProgressionModel } from './progressionModels';
import { decideExerciseProgression } from './exerciseProgressionEngine';

/**
 * Composes progressionModels + exerciseProgressionEngine into the one call planEngine
 * needs: given an already equipment/location/injury-resolved exercise (so evidence and
 * the resulting target are always attached to what the athlete will actually see today,
 * never a substituted-away original), compute its progression decision and the display
 * string for its next target.
 *
 * This is the ONLY place that turns a `ProgressionTarget` back into the free-text `reps`
 * string the existing UI already renders — no other display logic is duplicated.
 */
export interface ExerciseProgressionContext {
  /** This exercise's own logged history, oldest first — already scoped by exercise name
   * (see LogContext.getExerciseHistory). */
  getHistory: (exerciseName: string) => ExercisePerformanceLog[];
  /** Daily Readiness status for a given date, or null if no check-in exists for it. */
  getReadinessStatus: (date: string) => ReadinessStatus | null;
}

function formatDuration(sec: number): string {
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60} min`;
  return `${sec} sec`;
}

function formatTarget(target: ProgressionTarget, model: ProgressionModel, fallbackReps: string): string {
  switch (model) {
    case 'load':
      if (target.reps === undefined) return fallbackReps;
      return target.loadKg !== undefined ? `${target.reps} @ ${target.loadKg}kg` : `${target.reps}`;
    case 'rep_range':
      return target.reps !== undefined ? `${target.reps}` : fallbackReps;
    case 'distance':
      return target.distanceM !== undefined ? `${target.distanceM}m` : fallbackReps;
    case 'duration':
      return target.durationSec !== undefined ? formatDuration(target.durationSec) : fallbackReps;
    case 'technique':
      return fallbackReps;
  }
}

export interface ProgressedExercise {
  reps: string;
  decision: ExerciseProgressionDecision;
}

/**
 * Returns null for a non-progressed block (warmup/cooldown), otherwise the display
 * `reps` string for today's target and the full structured decision behind it — the
 * same decision the AI Coach and Progress screen read from.
 */
export function applyExerciseProgression(
  resolved: { name: string; sets: number; reps: string; category: ExerciseCategory },
  equipmentForModel: string[],
  context: ExerciseProgressionContext
): ProgressedExercise | null {
  const config = inferProgressionModel({ reps: resolved.reps, category: resolved.category, equipment: equipmentForModel });
  if (!config) return null;

  const baseTarget = deriveBaseTarget(
    { reps: resolved.reps, category: resolved.category, equipment: equipmentForModel, sets: resolved.sets },
    config
  );
  const history = context.getHistory(resolved.name);
  const decision = decideExerciseProgression(resolved.name, config, baseTarget, history, context.getReadinessStatus);

  const reps = decision.nextTarget ? formatTarget(decision.nextTarget, decision.model, resolved.reps) : resolved.reps;
  return { reps, decision };
}
