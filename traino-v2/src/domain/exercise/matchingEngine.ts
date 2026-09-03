import type { ExerciseDefinition, ExerciseDifficulty, ExerciseMatchQuery, ExercisePreferenceSignal, MatchCandidate, MatchReasonCode } from './types';
import { getAllExercises, getExercise } from './registry';

/**
 * Deterministic exercise matching/ranking engine (spec §5). Pure function of
 * its inputs — same query always produces the same ranked list, no
 * randomness, no AI model. Sport-agnostic: every sport-specific behavior
 * comes from `ExerciseDefinition.sportRelevance` data, never a branch on a
 * sport id in here (verified by the architecture grep in the quality gate).
 *
 * Two HARD filters run before any scoring (spec §6/§7) — an unsafe or
 * equipment-incompatible exercise can never appear in the result at all,
 * regardless of how well it would otherwise rank. Everything else (training
 * intent, movement pattern, muscle overlap, athlete level, sport relevance,
 * progression compatibility, preference/history) is ranking-only.
 */

const WEIGHTS = {
  movementPattern: 60,
  trainingIntentPerMatch: 100,
  muscleOverlapPerMuscle: 12,
  noEquipmentRequired: 6,
  equipmentAvailable: 3,
  matchesAthleteLevel: 10,
  sportRelevancePrimary: 8,
  sportRelevanceSupportive: 5,
  sportRelevanceGeneral: 2,
  progressionCompatible: 4,
  preferenceLiked: 5,
  preferenceFrequentlyCompleted: 3,
  preferenceFrequentlyReplaced: -4,
  preferenceFrequentlySkipped: -3,
  preferenceDisliked: -8,
  recentlyUsedPenalty: -2,
} as const;

/** Safety is never a ranking signal — an unsafe exercise must be impossible
 * to return, not merely ranked low (spec §6). */
function isSafeFor(ex: ExerciseDefinition, injuryIds: string[]): boolean {
  return !ex.safety.contraindications.some((tag) => injuryIds.includes(tag));
}

/** Same "any one of these ids satisfies the slot" convention `ExerciseSlot.equipment`
 * already uses (planEngine.ts's `missingEquipment` check) — never a duplicate rule. */
function equipmentSatisfied(ex: ExerciseDefinition, availableEquipment: string[], bodyweightOnly: boolean): boolean {
  if (bodyweightOnly) return ex.equipment.length === 0;
  return ex.equipment.length === 0 || ex.equipment.some((id) => availableEquipment.includes(id));
}

function primaryMuscleOverlap(source: ExerciseDefinition | undefined, ex: ExerciseDefinition): number {
  if (!source) return 0;
  return ex.primaryMuscles.filter((m) => source.primaryMuscles.includes(m)).length;
}

/**
 * Ranked, safety- and equipment-filtered candidates for replacing
 * `query.sourceExerciseId`. Never includes the source exercise itself (an
 * exercise never recommends itself), never includes an unsafe or
 * equipment-incompatible exercise.
 */
export function findExerciseAlternatives(query: ExerciseMatchQuery): MatchCandidate[] {
  const source = getExercise(query.sourceExerciseId);
  const bodyweightOnly = query.bodyweightOnly ?? false;

  const candidates: MatchCandidate[] = [];
  for (const ex of getAllExercises()) {
    if (ex.id === query.sourceExerciseId) continue;
    if (!isSafeFor(ex, query.injuryIds)) continue;
    if (!equipmentSatisfied(ex, query.availableEquipment, bodyweightOnly)) continue;

    const reasons: MatchReasonCode[] = [];
    let score = 0;

    if (source && ex.movementPattern === source.movementPattern) {
      reasons.push('same_movement_pattern');
      score += WEIGHTS.movementPattern;
    }

    const matchingIntents = ex.trainingIntents.filter((intent) => query.intent.includes(intent));
    if (matchingIntents.length > 0) {
      reasons.push('same_training_intent');
      score += WEIGHTS.trainingIntentPerMatch * matchingIntents.length;
    }

    const muscleOverlap = primaryMuscleOverlap(source, ex);
    if (muscleOverlap > 0) {
      reasons.push('muscle_overlap');
      score += WEIGHTS.muscleOverlapPerMuscle * muscleOverlap;
    }

    if (ex.equipment.length === 0) {
      reasons.push('no_equipment_required');
      score += WEIGHTS.noEquipmentRequired;
    } else {
      reasons.push('equipment_available');
      score += WEIGHTS.equipmentAvailable;
    }

    if (query.athleteLevel && ex.difficulty === query.athleteLevel) {
      reasons.push('matches_athlete_level');
      score += WEIGHTS.matchesAthleteLevel;
    }

    const relevance = query.sport ? ex.sportRelevance[query.sport] : undefined;
    if (relevance) {
      reasons.push('sport_relevant');
      score +=
        relevance === 'primary'
          ? WEIGHTS.sportRelevancePrimary
          : relevance === 'supportive'
            ? WEIGHTS.sportRelevanceSupportive
            : WEIGHTS.sportRelevanceGeneral;
    }

    if (source && ex.progressionModel === source.progressionModel) {
      reasons.push('progression_compatible');
      score += WEIGHTS.progressionCompatible;
    }

    const preference = query.preferenceByExerciseId?.[ex.id];
    if (preference === 'liked') {
      reasons.push('previously_preferred');
      score += WEIGHTS.preferenceLiked;
    } else if (preference === 'frequently_completed') {
      reasons.push('frequently_completed');
      score += WEIGHTS.preferenceFrequentlyCompleted;
    } else if (preference === 'frequently_replaced') {
      score += WEIGHTS.preferenceFrequentlyReplaced;
    } else if (preference === 'frequently_skipped') {
      score += WEIGHTS.preferenceFrequentlySkipped;
    } else if (preference === 'disliked') {
      score += WEIGHTS.preferenceDisliked;
    }

    // Avoid excessive repetition where appropriate — never an exclusion rule
    // (spec §13), just a small ranking nudge toward variety.
    if (query.recentlyUsedExerciseIds?.includes(ex.id)) {
      score += WEIGHTS.recentlyUsedPenalty;
    }

    candidates.push({ exercise: ex, score, reasons });
  }

  // Deterministic tie-break: same score always resolves the same way (by id),
  // never by insertion order or anything non-reproducible.
  candidates.sort((a, b) => b.score - a.score || a.exercise.id.localeCompare(b.exercise.id));
  return candidates;
}

export interface AthleteConstraints {
  availableEquipment: string[];
  injuryIds: string[];
  sport?: string;
  athleteLevel?: ExerciseDifficulty;
  preferenceByExerciseId?: Record<string, ExercisePreferenceSignal>;
  recentlyUsedExerciseIds?: string[];
}

/** Convenience wrapper for the common case: rank replacements for a known
 * exercise using its own training intents as the intent to preserve, so
 * callers (UI, AI Coach) don't have to re-derive intent themselves. */
export function suggestReplacements(sourceExerciseId: string, constraints: AthleteConstraints, limit = 5): MatchCandidate[] {
  const source = getExercise(sourceExerciseId);
  const query: ExerciseMatchQuery = {
    sourceExerciseId,
    intent: source?.trainingIntents ?? [],
    availableEquipment: constraints.availableEquipment,
    injuryIds: constraints.injuryIds,
    sport: constraints.sport,
    athleteLevel: constraints.athleteLevel,
    preferenceByExerciseId: constraints.preferenceByExerciseId,
    recentlyUsedExerciseIds: constraints.recentlyUsedExerciseIds,
  };
  return findExerciseAlternatives(query).slice(0, limit);
}

/** Deterministic bodyweight fallback (spec §8): the same ranking, hard-filtered
 * to equipment-free exercises, so the top result still preserves the source's
 * movement pattern/training intent instead of defaulting to a generic
 * push-up/squat regardless of what's being replaced. */
export function findBodyweightAlternative(sourceExerciseId: string, constraints: Omit<AthleteConstraints, 'availableEquipment'>): MatchCandidate | undefined {
  const source = getExercise(sourceExerciseId);
  const query: ExerciseMatchQuery = {
    sourceExerciseId,
    intent: source?.trainingIntents ?? [],
    availableEquipment: [],
    injuryIds: constraints.injuryIds,
    sport: constraints.sport,
    athleteLevel: constraints.athleteLevel,
    bodyweightOnly: true,
    preferenceByExerciseId: constraints.preferenceByExerciseId,
    recentlyUsedExerciseIds: constraints.recentlyUsedExerciseIds,
  };
  return findExerciseAlternatives(query)[0];
}
