import type { ExerciseCategory, ExerciseSlot, FitnessLevel, SportModuleData } from '../engine/types';
import type { ExerciseDefinition } from './types';
import { inferProgressionModel } from '../engine/progressionModels';
import { classifyDifficulty, classifyImpactLevel, classifyMovementPattern, classifyTrainingIntents, classifyUnilateral, slugify } from './classify';
import { CURATED_OVERLAY } from './curatedOverlay';
import { LEGACY_ALTERNATIVES_BY_NAME } from './legacyAlternatives';

/**
 * Builds the Exercise Library from the SAME data every sport module and the
 * legacy exerciseAlternatives table already authors — a "clean migration
 * path", not a second competing source of truth (spec §1/§16/§17/§23).
 *
 * Every exercise actually used by a registered sport module (including its
 * `bodyweightAlternative`s) gets a real `ExerciseDefinition`, generically
 * classified from its own slot data (category/equipment/reps/contraindications/
 * highImpact/which levels and sports it's authored under) — never a name
 * check inside an engine. A small hand-curated overlay (curatedOverlay.ts)
 * fills in real primaryMuscles/coachingCues/instructions for the movements
 * central enough to be worth authoring precisely; everything else keeps
 * honest, derived-only data rather than fabricated specifics.
 */

interface RawObservation {
  name: string;
  category: ExerciseCategory;
  equipment: string[];
  contraindications: string[];
  highImpact: boolean;
  reps: string;
  sportsSeen: Set<string>;
  levelsSeen: Set<FitnessLevel>;
  /** True if this observation only ever appears as a `bodyweightAlternative`
   * (never as a slot's own primary movement) — always equipment-free by the
   * existing ExerciseSlot contract. */
  isBodyweightAlternativeOnly: boolean;
}

function upsert(observations: Map<string, RawObservation>, obs: Omit<RawObservation, 'sportsSeen' | 'levelsSeen'> & { sport: string; level: FitnessLevel }) {
  const existing = observations.get(obs.name);
  if (!existing) {
    observations.set(obs.name, {
      name: obs.name,
      category: obs.category,
      equipment: obs.equipment,
      contraindications: obs.contraindications,
      highImpact: obs.highImpact,
      reps: obs.reps,
      sportsSeen: new Set([obs.sport]),
      levelsSeen: new Set([obs.level]),
      isBodyweightAlternativeOnly: obs.isBodyweightAlternativeOnly,
    });
    return;
  }
  existing.sportsSeen.add(obs.sport);
  existing.levelsSeen.add(obs.level);
  // A primary-slot sighting always overrides a bodyweight-alternative-only sighting —
  // the primary movement's own equipment/contraindications are the real, authoritative
  // data for that exercise name.
  if (!obs.isBodyweightAlternativeOnly) {
    existing.isBodyweightAlternativeOnly = false;
    existing.category = obs.category;
    existing.equipment = obs.equipment;
    existing.contraindications = obs.contraindications;
    existing.highImpact = obs.highImpact;
    existing.reps = obs.reps;
  }
}

function collectFromSlot(observations: Map<string, RawObservation>, slot: ExerciseSlot, sport: string, level: FitnessLevel) {
  upsert(observations, {
    name: slot.name,
    category: slot.category,
    equipment: slot.equipment,
    contraindications: slot.contraindications ?? [],
    highImpact: slot.highImpact ?? false,
    reps: slot.reps,
    sport,
    level,
    isBodyweightAlternativeOnly: false,
  });
  if (slot.bodyweightAlternative) {
    upsert(observations, {
      name: slot.bodyweightAlternative.name,
      category: slot.category,
      equipment: [],
      contraindications: [],
      highImpact: false,
      reps: slot.bodyweightAlternative.reps,
      sport,
      level,
      isBodyweightAlternativeOnly: true,
    });
  }
}

function collectRawObservations(modules: { sportId: string; module: SportModuleData }[]): Map<string, RawObservation> {
  const observations = new Map<string, RawObservation>();
  for (const { sportId, module } of modules) {
    for (const level of Object.keys(module.program) as FitnessLevel[]) {
      for (const day of module.program[level]) {
        for (const slot of day.exercises) {
          collectFromSlot(observations, slot, sportId, level);
        }
      }
    }
  }
  // The legacy alternatives table references some names that never appear as an
  // authored slot anywhere (e.g. "Front Squat") — fold those in too, conservatively
  // (bodyweight-equipment default, no known contraindications), so every id the old
  // table can suggest resolves to a real, valid ExerciseDefinition.
  for (const [sourceName, alts] of Object.entries(LEGACY_ALTERNATIVES_BY_NAME)) {
    if (!observations.has(sourceName)) {
      // The source itself should already be a real slot; if it somehow isn't (a stale
      // table entry), skip rather than fabricate a whole exercise from nothing.
      continue;
    }
    for (const alt of alts) {
      if (observations.has(alt.name)) continue;
      const source = observations.get(sourceName)!;
      upsert(observations, {
        name: alt.name,
        category: source.category,
        equipment: [],
        contraindications: [],
        highImpact: false,
        reps: alt.reps,
        sport: Array.from(source.sportsSeen)[0] ?? 'football',
        level: 'intermediate',
        isBodyweightAlternativeOnly: false,
      });
    }
  }
  return observations;
}

function deriveDefinition(obs: RawObservation): ExerciseDefinition {
  const id = slugify(obs.name);
  const movementPattern = classifyMovementPattern(obs.name);
  const progressionConfig = inferProgressionModel({ reps: obs.reps, category: obs.category, equipment: obs.equipment });

  const base: ExerciseDefinition = {
    id,
    canonicalName: obs.name,
    displayName: obs.name,
    aliases: [],
    category: obs.category,
    movementPattern,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: obs.equipment,
    difficulty: classifyDifficulty(obs.levelsSeen),
    trainingIntents: classifyTrainingIntents(obs.category),
    progressionModel: progressionConfig?.model ?? 'technique',
    unilateral: classifyUnilateral(obs.name, obs.reps),
    impactLevel: classifyImpactLevel(obs.highImpact, obs.category),
    stabilityDemand: classifyUnilateral(obs.name, obs.reps) || movementPattern === 'balance' ? 'moderate' : 'low',
    technicalDemand: movementPattern === 'technique' || obs.category === 'technique' ? 'high' : 'low',
    sportRelevance: Object.fromEntries(Array.from(obs.sportsSeen).map((s) => [s, 'primary' as const])),
    coachingCues: [],
    commonMistakes: [],
    instructions: [],
    alternativeIds: (LEGACY_ALTERNATIVES_BY_NAME[obs.name] ?? []).map((a) => slugify(a.name)),
    regressionIds: [],
    progressionIds: [],
    safety: {
      contraindications: obs.contraindications,
      highImpact: obs.highImpact,
    },
  };

  const overlay = CURATED_OVERLAY[id];
  return overlay ? { ...base, ...overlay, safety: { ...base.safety, ...overlay.safety } } : base;
}

export function buildExerciseLibrary(modules: { sportId: string; module: SportModuleData }[]): ExerciseDefinition[] {
  const observations = collectRawObservations(modules);
  const definitions = Array.from(observations.values()).map(deriveDefinition);

  // Curated-only regression/progression rungs (e.g. "Band-Assisted Pull-Up") that
  // aren't authored in any sport module — added once, never duplicating an id
  // already derived above.
  const derivedIds = new Set(definitions.map((d) => d.id));
  for (const [id, overlay] of Object.entries(CURATED_OVERLAY)) {
    if (derivedIds.has(id)) continue;
    if (!overlay.canonicalName) continue; // a partial overlay for a derived-only exercise, not a standalone entry
    definitions.push({
      id,
      canonicalName: overlay.canonicalName,
      displayName: overlay.displayName ?? overlay.canonicalName,
      aliases: overlay.aliases ?? [],
      category: overlay.category ?? 'strength',
      movementPattern: overlay.movementPattern ?? classifyMovementPattern(overlay.canonicalName),
      primaryMuscles: overlay.primaryMuscles ?? [],
      secondaryMuscles: overlay.secondaryMuscles ?? [],
      equipment: overlay.equipment ?? [],
      difficulty: overlay.difficulty ?? 'beginner',
      trainingIntents: overlay.trainingIntents ?? classifyTrainingIntents(overlay.category ?? 'strength'),
      progressionModel: overlay.progressionModel ?? 'rep_range',
      unilateral: overlay.unilateral ?? false,
      impactLevel: overlay.impactLevel ?? 'low',
      stabilityDemand: overlay.stabilityDemand ?? 'low',
      technicalDemand: overlay.technicalDemand ?? 'low',
      sportRelevance: overlay.sportRelevance ?? {},
      coachingCues: overlay.coachingCues ?? [],
      commonMistakes: overlay.commonMistakes ?? [],
      instructions: overlay.instructions ?? [],
      alternativeIds: overlay.alternativeIds ?? [],
      regressionIds: overlay.regressionIds ?? [],
      progressionIds: overlay.progressionIds ?? [],
      safety: overlay.safety ?? { contraindications: [], highImpact: false },
    });
  }

  return definitions;
}
