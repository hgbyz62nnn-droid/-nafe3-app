import type { ExerciseDefinition, ExerciseDifficulty, MovementPattern, TrainingIntent } from './types';
import type { ProgressionModel } from '../progression/types';
import { EQUIPMENT_OPTIONS } from '../assessment/equipment';

/**
 * Strict Exercise Library validator — the same "fail fast at import time"
 * contract `validateSportModule.ts` already uses for sport modules. A
 * malformed library must never silently reach the matching/progression
 * engines or a generated plan.
 */

const VALID_MOVEMENT_PATTERNS: Set<MovementPattern> = new Set([
  'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'squat', 'hinge', 'lunge',
  'carry', 'rotation', 'anti_rotation', 'anti_extension', 'anti_lateral_flexion', 'locomotion', 'jump',
  'landing', 'sprint', 'acceleration', 'deceleration', 'change_of_direction', 'balance', 'mobility',
  'technique', 'conditioning', 'other',
]);

const VALID_TRAINING_INTENTS: Set<TrainingIntent> = new Set([
  'strength', 'hypertrophy', 'power', 'speed', 'acceleration', 'agility', 'conditioning', 'endurance',
  'technique', 'mobility', 'stability', 'recovery',
]);

const VALID_DIFFICULTIES: Set<ExerciseDifficulty> = new Set(['beginner', 'intermediate', 'advanced']);
const VALID_PROGRESSION_MODELS: Set<ProgressionModel> = new Set(['rep_range', 'load', 'distance', 'duration', 'technique']);
const VALID_EQUIPMENT_IDS = new Set(EQUIPMENT_OPTIONS.map((e) => e.id));

export class ExerciseLibraryValidationError extends Error {}

function fail(messages: string[]): never {
  throw new ExerciseLibraryValidationError(`Exercise Library validation failed:\n- ${messages.join('\n- ')}`);
}

export function validateExerciseLibrary(library: ExerciseDefinition[]): void {
  const errors: string[] = [];
  const idSet = new Set<string>();
  /** lowercased canonicalName/alias -> the id(s) it resolves to, to catch ambiguous collisions. */
  const nameToIds = new Map<string, Set<string>>();

  for (const ex of library) {
    if (!ex.id || typeof ex.id !== 'string') {
      errors.push(`an exercise has an empty/invalid id (canonicalName: "${ex.canonicalName}")`);
      continue;
    }
    if (idSet.has(ex.id)) {
      errors.push(`duplicate exercise id "${ex.id}"`);
    }
    idSet.add(ex.id);

    if (!ex.canonicalName || ex.canonicalName.trim().length === 0) {
      errors.push(`exercise "${ex.id}" has an empty canonicalName`);
    }
    if (!VALID_MOVEMENT_PATTERNS.has(ex.movementPattern)) {
      errors.push(`exercise "${ex.id}" has an invalid movementPattern "${ex.movementPattern}"`);
    }
    if (!VALID_DIFFICULTIES.has(ex.difficulty)) {
      errors.push(`exercise "${ex.id}" has an invalid difficulty "${ex.difficulty}"`);
    }
    if (!VALID_PROGRESSION_MODELS.has(ex.progressionModel)) {
      errors.push(`exercise "${ex.id}" has an invalid progressionModel "${ex.progressionModel}"`);
    }
    for (const intent of ex.trainingIntents) {
      if (!VALID_TRAINING_INTENTS.has(intent)) {
        errors.push(`exercise "${ex.id}" has an invalid trainingIntent "${intent}"`);
      }
    }
    for (const eq of ex.equipment) {
      if (!VALID_EQUIPMENT_IDS.has(eq)) {
        errors.push(`exercise "${ex.id}" references an unknown equipment id "${eq}"`);
      }
    }

    for (const [field, ids] of [
      ['alternativeIds', ex.alternativeIds],
      ['regressionIds', ex.regressionIds],
      ['progressionIds', ex.progressionIds],
    ] as const) {
      for (const refId of ids) {
        if (refId === ex.id) {
          errors.push(`exercise "${ex.id}" lists itself in ${field} (self-reference)`);
        }
      }
    }

    const names = [ex.canonicalName.toLowerCase(), ...ex.aliases.map((a) => a.toLowerCase())];
    for (const name of names) {
      if (!nameToIds.has(name)) nameToIds.set(name, new Set());
      nameToIds.get(name)!.add(ex.id);
    }
  }

  // Referenced ids must exist — checked in a second pass, after every real id is known.
  for (const ex of library) {
    for (const [field, ids] of [
      ['alternativeIds', ex.alternativeIds],
      ['regressionIds', ex.regressionIds],
      ['progressionIds', ex.progressionIds],
    ] as const) {
      for (const refId of ids) {
        if (refId !== ex.id && !idSet.has(refId)) {
          errors.push(`exercise "${ex.id}" references unknown ${field} id "${refId}"`);
        }
      }
    }
  }

  for (const [name, ids] of nameToIds) {
    if (ids.size > 1) {
      errors.push(`the name/alias "${name}" resolves ambiguously to multiple exercises: ${Array.from(ids).join(', ')}`);
    }
  }

  if (errors.length > 0) fail(errors);
}
