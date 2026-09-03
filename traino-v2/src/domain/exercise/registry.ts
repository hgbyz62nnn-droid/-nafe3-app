import type { ExerciseDefinition, ExerciseDifficulty, MovementPattern, TrainingIntent } from './types';
import { footballModule } from '../sports/football/program';
import { swimmingModule } from '../sports/swimming/program';
import { genericModule } from '../sports/generic/program';
import { buildExerciseLibrary } from './deriveDefinitions';
import { validateExerciseLibrary } from './validateLibrary';

/**
 * Exercise Registry — the single, validated, read-only entry point onto the
 * Exercise Library. Mirrors `domain/sports/registry.ts`'s "derive, validate
 * at import time, expose read-only lookups" contract exactly: a malformed
 * library must never silently reach the matching/progression engines or a
 * generated plan.
 *
 * Derived from the SAME real sport modules already registered for planning
 * (see domain/sports/registry.ts) — adding/editing a sport module's
 * exercises automatically flows through here with no additional
 * maintenance and no second source of truth.
 */
const LIBRARY: readonly ExerciseDefinition[] = Object.freeze(
  buildExerciseLibrary([
    { sportId: 'football', module: footballModule },
    { sportId: 'swimming', module: swimmingModule },
    { sportId: 'generic', module: genericModule },
  ]).map((ex) => Object.freeze(ex)),
);

// Fail fast: at import time (tsc -b, test run, or dev server start) rather
// than at runtime inside a matching/progression decision.
validateExerciseLibrary(LIBRARY as ExerciseDefinition[]);

const BY_ID = new Map<string, ExerciseDefinition>(LIBRARY.map((ex) => [ex.id, ex]));

/** Lowercased canonicalName/alias -> exercise id. Validated unambiguous by
 * validateExerciseLibrary above, so this map is safe to build 1:1. */
const BY_NAME = new Map<string, string>();
for (const ex of LIBRARY) {
  BY_NAME.set(ex.canonicalName.toLowerCase(), ex.id);
  for (const alias of ex.aliases) {
    BY_NAME.set(alias.toLowerCase(), ex.id);
  }
}

export function getExercise(id: string): ExerciseDefinition | undefined {
  return BY_ID.get(id);
}

/** Case-insensitive lookup by canonical name or any known alias. */
export function getExerciseByName(name: string): ExerciseDefinition | undefined {
  const id = BY_NAME.get(name.toLowerCase());
  return id ? BY_ID.get(id) : undefined;
}

export interface ExerciseSearchCriteria {
  movementPattern?: MovementPattern;
  category?: ExerciseDefinition['category'];
  trainingIntent?: TrainingIntent;
  equipmentSubset?: string[];
  difficulty?: ExerciseDifficulty;
  sport?: string;
}

/** Generic, deterministic filtering — every criterion supplied must match;
 * omitted criteria are not filtered on. No ranking here (see the matching
 * engine for ranked candidate selection). */
export function searchExercises(criteria: ExerciseSearchCriteria): ExerciseDefinition[] {
  return LIBRARY.filter((ex) => {
    if (criteria.movementPattern && ex.movementPattern !== criteria.movementPattern) return false;
    if (criteria.category && ex.category !== criteria.category) return false;
    if (criteria.trainingIntent && !ex.trainingIntents.includes(criteria.trainingIntent)) return false;
    if (criteria.difficulty && ex.difficulty !== criteria.difficulty) return false;
    if (criteria.sport && !ex.sportRelevance[criteria.sport]) return false;
    if (criteria.equipmentSubset && !ex.equipment.every((eq) => criteria.equipmentSubset!.includes(eq))) return false;
    return true;
  });
}

export function getProgressions(id: string): ExerciseDefinition[] {
  const ex = BY_ID.get(id);
  if (!ex) return [];
  return ex.progressionIds.map((pid) => BY_ID.get(pid)).filter((e): e is ExerciseDefinition => e !== undefined);
}

export function getRegressions(id: string): ExerciseDefinition[] {
  const ex = BY_ID.get(id);
  if (!ex) return [];
  return ex.regressionIds.map((rid) => BY_ID.get(rid)).filter((e): e is ExerciseDefinition => e !== undefined);
}

export function getAlternativesLegacy(id: string): ExerciseDefinition[] {
  const ex = BY_ID.get(id);
  if (!ex) return [];
  return ex.alternativeIds.map((aid) => BY_ID.get(aid)).filter((e): e is ExerciseDefinition => e !== undefined);
}

/** Read-only snapshot of the full library — for callers that need to
 * enumerate everything (e.g. tests, admin/debug views). Never mutate the
 * returned array or its entries; both are frozen. */
export function getAllExercises(): readonly ExerciseDefinition[] {
  return LIBRARY;
}
