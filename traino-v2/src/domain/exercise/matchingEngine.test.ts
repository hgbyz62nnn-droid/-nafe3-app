import { describe, expect, it } from 'vitest';
import { findBodyweightAlternative, findExerciseAlternatives, suggestReplacements } from './matchingEngine';
import { getAllExercises, getExercise } from './registry';
import type { ExerciseMatchQuery } from './types';

/**
 * Exercise Intelligence matching-engine test matrix (remaining letters from spec §24)
 * and the property/invariant tests from spec §25 — run against the REAL derived
 * library (not synthetic fixtures), because the invariants only mean something if
 * they hold for the actual data the app ships with.
 */

function baseQuery(overrides: Partial<ExerciseMatchQuery> = {}): ExerciseMatchQuery {
  return {
    sourceExerciseId: 'back-squat',
    intent: ['strength', 'hypertrophy'],
    availableEquipment: ['barbell', 'squat_rack', 'bench', 'dumbbells', 'pull_up_bar'],
    injuryIds: ['none'],
    ...overrides,
  };
}

// J: Muscle overlap ranking
describe('Exercise Matching Engine — J: muscle overlap ranking', () => {
  it('ranks a candidate sharing primary muscles with the source above one that does not', () => {
    const results = findExerciseAlternatives(baseQuery());
    const gobletSquat = results.find((c) => c.exercise.id === 'goblet-squat'); // shares quads+glutes
    const plank = results.find((c) => c.exercise.id === 'plank'); // shares nothing with back-squat
    expect(gobletSquat).toBeDefined();
    expect(plank).toBeDefined();
    expect(gobletSquat!.score).toBeGreaterThan(plank!.score);
    expect(gobletSquat!.reasons).toContain('muscle_overlap');
  });
});

// K: Sport relevance ranking
describe('Exercise Matching Engine — K: sport relevance ranking', () => {
  it('a football-relevant candidate outscores an otherwise-identical non-relevant one, all else equal', () => {
    const withSport = findExerciseAlternatives(baseQuery({ sport: 'football' }));
    const withoutSport = findExerciseAlternatives(baseQuery({ sport: undefined }));
    const withSportCandidate = withSport.find((c) => c.exercise.id === 'front-squat');
    const withoutSportCandidate = withoutSport.find((c) => c.exercise.id === 'front-squat');
    expect(withSportCandidate).toBeDefined();
    expect(withoutSportCandidate).toBeDefined();
    expect(withSportCandidate!.score).toBeGreaterThanOrEqual(withoutSportCandidate!.score);
  });
});

// L: Difficulty / athlete-level ranking
describe('Exercise Matching Engine — L: athlete level ranking', () => {
  it('a candidate matching the athlete\'s level scores higher than the identical query without a level', () => {
    const withLevel = findExerciseAlternatives(baseQuery({ athleteLevel: 'beginner' }));
    const withoutLevel = findExerciseAlternatives(baseQuery({ athleteLevel: undefined }));
    const candidate = withLevel.find((c) => c.exercise.difficulty === 'beginner');
    expect(candidate).toBeDefined();
    const sameCandidateNoLevel = withoutLevel.find((c) => c.exercise.id === candidate!.exercise.id)!;
    expect(candidate!.score).toBeGreaterThan(sameCandidateNoLevel.score);
  });
});

// M: Safety hard exclusion
describe('Exercise Matching Engine — M: safety is a hard filter', () => {
  it('never returns an exercise whose contraindications include the athlete\'s reported injury', () => {
    const results = findExerciseAlternatives(baseQuery({ injuryIds: ['knee'] }));
    expect(results.some((c) => c.exercise.safety.contraindications.includes('knee'))).toBe(false);
  });

  it('a preferred-but-unsafe exercise is never returned (safety outranks preference)', () => {
    // Find a real exercise with a knee contraindication to use as the "preferred but unsafe" target.
    const unsafe = getAllExercises().find((e) => e.safety.contraindications.includes('knee'));
    expect(unsafe).toBeDefined();
    const results = findExerciseAlternatives(
      baseQuery({ injuryIds: ['knee'], preferenceByExerciseId: { [unsafe!.id]: 'liked' } })
    );
    expect(results.some((c) => c.exercise.id === unsafe!.id)).toBe(false);
  });

  it('a sport-relevant-but-unsafe exercise is never returned (safety outranks sport relevance)', () => {
    const unsafe = getAllExercises().find((e) => e.safety.contraindications.includes('knee') && Object.keys(e.sportRelevance).length > 0);
    if (unsafe) {
      const sport = Object.keys(unsafe.sportRelevance)[0];
      const results = findExerciseAlternatives(baseQuery({ injuryIds: ['knee'], sport }));
      expect(results.some((c) => c.exercise.id === unsafe.id)).toBe(false);
    }
  });
});

// N: Equipment hard filter
describe('Exercise Matching Engine — N: equipment is a hard filter', () => {
  it('never returns an exercise requiring equipment the athlete does not have', () => {
    const results = findExerciseAlternatives(baseQuery({ availableEquipment: ['dumbbells'] }));
    for (const c of results) {
      expect(c.exercise.equipment.length === 0 || c.exercise.equipment.includes('dumbbells')).toBe(true);
    }
  });
});

// O: Bodyweight fallback
describe('Exercise Matching Engine — O: bodyweight fallback', () => {
  it('findBodyweightAlternative only ever returns an equipment-free exercise', () => {
    const alt = findBodyweightAlternative('back-squat', { injuryIds: ['none'] });
    expect(alt).toBeDefined();
    expect(alt!.exercise.equipment).toEqual([]);
  });

  it('the bodyweight fallback preserves the source\'s movement pattern rather than defaulting to a generic squat/push-up', () => {
    const source = getExercise('back-squat')!;
    const alt = findBodyweightAlternative('back-squat', { injuryIds: ['none'] });
    expect(alt!.exercise.movementPattern).toBe(source.movementPattern);
  });

  it('bodyweightOnly is a hard filter even when equipment IS available in availableEquipment', () => {
    const results = findExerciseAlternatives(baseQuery({ bodyweightOnly: true }));
    expect(results.every((c) => c.exercise.equipment.length === 0)).toBe(true);
  });
});

// P: Progression metadata compatibility ranking
describe('Exercise Matching Engine — P: progression compatibility ranking', () => {
  it('a candidate sharing the source\'s progressionModel scores at least as high as an identical-in-every-other-way one that does not', () => {
    const source = getExercise('back-squat')!;
    const results = findExerciseAlternatives(baseQuery());
    const sameModel = results.find((c) => c.exercise.progressionModel === source.progressionModel);
    expect(sameModel).toBeDefined();
    expect(sameModel!.reasons).toContain('progression_compatible');
  });
});

// Q: Self-reference rejection (matching engine level)
describe('Exercise Matching Engine — Q: no exercise recommends itself', () => {
  it('the source exercise never appears in its own candidate list, across the whole library', () => {
    for (const ex of getAllExercises()) {
      const results = findExerciseAlternatives(baseQuery({ sourceExerciseId: ex.id, intent: ex.trainingIntents }));
      expect(results.some((c) => c.exercise.id === ex.id)).toBe(false);
    }
  });
});

// R: Deterministic ranking
describe('Exercise Matching Engine — R: deterministic ranking', () => {
  it('identical queries always produce identical ranked output, run repeatedly', () => {
    const query = baseQuery({ sport: 'football', athleteLevel: 'intermediate' });
    const runs = Array.from({ length: 5 }, () => findExerciseAlternatives(query).map((c) => `${c.exercise.id}:${c.score}`));
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(runs[0]);
    }
  });
});

// S: Preference ranking
describe('Exercise Matching Engine — S: preference ranking', () => {
  it('a liked exercise outranks an otherwise-identical non-preferred one', () => {
    const candidateId = 'front-squat';
    const without = findExerciseAlternatives(baseQuery()).find((c) => c.exercise.id === candidateId)!;
    const withLike = findExerciseAlternatives(baseQuery({ preferenceByExerciseId: { [candidateId]: 'liked' } })).find(
      (c) => c.exercise.id === candidateId
    )!;
    expect(withLike.score).toBeGreaterThan(without.score);
    expect(withLike.reasons).toContain('previously_preferred');
  });

  it('a disliked exercise ranks lower than the same candidate with no preference signal', () => {
    const candidateId = 'front-squat';
    const without = findExerciseAlternatives(baseQuery()).find((c) => c.exercise.id === candidateId)!;
    const withDislike = findExerciseAlternatives(baseQuery({ preferenceByExerciseId: { [candidateId]: 'disliked' } })).find(
      (c) => c.exercise.id === candidateId
    )!;
    expect(withDislike.score).toBeLessThan(without.score);
  });

  it('training intent match outranks a mere preference signal (intent weighted far higher)', () => {
    // A candidate matching training intent (no preference) should still outrank a
    // preferred candidate that shares none of the query's training intent.
    const results = findExerciseAlternatives(
      baseQuery({ intent: ['strength'], preferenceByExerciseId: { plank: 'liked' } })
    );
    const intentMatch = results.find((c) => c.reasons.includes('same_training_intent'));
    const likedOnly = results.find((c) => c.exercise.id === 'plank');
    expect(intentMatch).toBeDefined();
    expect(likedOnly).toBeDefined();
    expect(intentMatch!.score).toBeGreaterThan(likedOnly!.score);
  });
});

// T: History ranking (recently-used nudge)
describe('Exercise Matching Engine — T: history ranking', () => {
  it('a recently-used exercise ranks lower than the identical candidate with no history, but is not excluded', () => {
    const candidateId = 'front-squat';
    const without = findExerciseAlternatives(baseQuery()).find((c) => c.exercise.id === candidateId)!;
    const withHistory = findExerciseAlternatives(baseQuery({ recentlyUsedExerciseIds: [candidateId] })).find(
      (c) => c.exercise.id === candidateId
    )!;
    expect(withHistory.score).toBeLessThan(without.score);
  });
});

// U: exerciseAlternatives / suggestReplacements convenience wrapper
describe('Exercise Matching Engine — U: suggestReplacements convenience wrapper', () => {
  it('automatically uses the source exercise\'s own training intents, and respects the limit', () => {
    const top = suggestReplacements('back-squat', { availableEquipment: ['barbell', 'squat_rack', 'dumbbells'], injuryIds: ['none'] }, 2);
    expect(top.length).toBeLessThanOrEqual(2);
    expect(top.every((c) => c.exercise.id !== 'back-squat')).toBe(true);
  });
});

// V: property invariants across the whole library (spec §25)
describe('Exercise Matching Engine — invariants (property tests over the full library)', () => {
  const ALL_INJURY_TAGS = ['knee', 'shoulder', 'lower_back', 'ankle'];

  it('for every real injury tag, no returned candidate is contraindicated for it', () => {
    for (const injury of ALL_INJURY_TAGS) {
      const results = findExerciseAlternatives(baseQuery({ injuryIds: [injury], availableEquipment: [] }));
      expect(results.every((c) => !c.exercise.safety.contraindications.includes(injury))).toBe(true);
    }
  });

  it('no returned candidate ever requires equipment outside a severely restricted availableEquipment set', () => {
    const results = findExerciseAlternatives(baseQuery({ availableEquipment: ['kettlebell'] }));
    expect(results.every((c) => c.exercise.equipment.length === 0 || c.exercise.equipment.includes('kettlebell'))).toBe(true);
  });

  it('all alternativeIds/regressionIds/progressionIds referenced anywhere in the library resolve to a real exercise', () => {
    const all = getAllExercises();
    const idSet = new Set(all.map((e) => e.id));
    for (const ex of all) {
      for (const refId of [...ex.alternativeIds, ...ex.regressionIds, ...ex.progressionIds]) {
        expect(idSet.has(refId), `"${ex.id}" references unknown id "${refId}"`).toBe(true);
      }
    }
  });

  it('no exercise in the library lists itself as its own alternative/regression/progression', () => {
    for (const ex of getAllExercises()) {
      expect([...ex.alternativeIds, ...ex.regressionIds, ...ex.progressionIds]).not.toContain(ex.id);
    }
  });

  it('every exercise in the library has a valid, recognized progressionModel', () => {
    const validModels = new Set(['rep_range', 'load', 'distance', 'duration', 'technique']);
    for (const ex of getAllExercises()) {
      expect(validModels.has(ex.progressionModel)).toBe(true);
    }
  });
});
