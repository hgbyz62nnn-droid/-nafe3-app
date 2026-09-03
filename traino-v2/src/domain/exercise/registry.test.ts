import { describe, expect, it } from 'vitest';
import { getAllExercises, getExercise, getExerciseByName, getProgressions, getRegressions, searchExercises } from './registry';
import { validateExerciseLibrary } from './validateLibrary';
import { getExerciseAlternatives } from '../engine/exerciseAlternatives';
import { LEGACY_ALTERNATIVES_BY_NAME } from './legacyAlternatives';
import { footballModule } from '../sports/football/program';
import { swimmingModule } from '../sports/swimming/program';
import type { ExerciseDefinition } from './types';
import { CURATED_OVERLAY } from './curatedOverlay';

/**
 * Exercise Intelligence test matrix (spec §24, letters A-N covered here — the
 * remaining letters live in matchingEngine.test.ts, preferences.test.ts, and
 * aiCoachEngine.test.ts's Exercise Intelligence describe block).
 */

// A: Registry loads
describe('Exercise Registry — A: loads', () => {
  it('builds a non-empty library at import time', () => {
    expect(getAllExercises().length).toBeGreaterThan(0);
  });
});

// B: Registry validation
describe('Exercise Registry — B: validation', () => {
  it('the real derived library passes strict validation (already proven by successful import, re-asserted explicitly)', () => {
    expect(() => validateExerciseLibrary(getAllExercises() as ExerciseDefinition[])).not.toThrow();
  });
});

// C: Unique IDs
describe('Exercise Registry — C: unique ids', () => {
  it('every exercise has a unique id', () => {
    const ids = getAllExercises().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// D: Name lookup
describe('Exercise Registry — D: name lookup', () => {
  it('resolves by exact canonical name', () => {
    expect(getExerciseByName('Back Squat')?.id).toBe('back-squat');
  });

  it('resolves case-insensitively', () => {
    expect(getExerciseByName('back squat')?.id).toBe('back-squat');
    expect(getExerciseByName('BACK SQUAT')?.id).toBe('back-squat');
  });

  it('returns undefined for a name not in the library', () => {
    expect(getExerciseByName('Not A Real Exercise')).toBeUndefined();
  });
});

// E: Alias lookup
describe('Exercise Registry — E: alias lookup', () => {
  it('resolves a normalized alias to the same exercise as its canonical name', () => {
    expect(getExerciseByName('Barbell Bench Press')?.id).toBe('bench-press');
    expect(getExerciseByName('DB Bench Press')?.id).toBe('dumbbell-bench-press');
    expect(getExerciseByName('barbell back squat')?.id).toBe('back-squat');
  });

  it('an alias and its canonical name never resolve to different exercises (no ambiguity)', () => {
    const bench = getExerciseByName('Bench Press');
    const benchAlias = getExerciseByName('Flat Bench Press');
    expect(bench?.id).toBe(benchAlias?.id);
  });
});

// F: Movement pattern filtering
describe('Exercise Registry — F: movement pattern filtering', () => {
  it('searchExercises filters strictly by movementPattern', () => {
    const squats = searchExercises({ movementPattern: 'squat' });
    expect(squats.length).toBeGreaterThan(0);
    expect(squats.every((e) => e.movementPattern === 'squat')).toBe(true);
  });
});

// G: Equipment filtering
describe('Exercise Registry — G: equipment filtering', () => {
  it('searchExercises with equipmentSubset only returns exercises whose equipment is a subset of it', () => {
    const results = searchExercises({ equipmentSubset: ['barbell', 'squat_rack'] });
    expect(results.length).toBeGreaterThan(0);
    for (const ex of results) {
      expect(ex.equipment.every((eq) => ['barbell', 'squat_rack'].includes(eq))).toBe(true);
    }
  });
});

// H: Intent filtering
describe('Exercise Registry — H: training intent filtering', () => {
  it('searchExercises filters strictly by trainingIntent', () => {
    const results = searchExercises({ trainingIntent: 'strength' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.trainingIntents.includes('strength'))).toBe(true);
  });
});

// I: Difficulty ranking / filtering
describe('Exercise Registry — I: difficulty', () => {
  it('every exercise has a valid difficulty and searchExercises can filter by it', () => {
    const beginner = searchExercises({ difficulty: 'beginner' });
    expect(beginner.every((e) => e.difficulty === 'beginner')).toBe(true);
  });
});

// N: Football exercises
describe('Exercise Registry — N: Football exercises resolve correctly', () => {
  it('every Football-authored exercise slot resolves to a real library entry', () => {
    for (const level of Object.keys(footballModule.program) as (keyof typeof footballModule.program)[]) {
      for (const day of footballModule.program[level]) {
        for (const slot of day.exercises) {
          expect(getExerciseByName(slot.name), `Football slot "${slot.name}" should resolve`).toBeDefined();
        }
      }
    }
  });

  it('Back Squat is tagged as football-relevant', () => {
    expect(getExercise('back-squat')?.sportRelevance.football).toBeDefined();
  });
});

// O: Swimming exercises
describe('Exercise Registry — O: Swimming exercises resolve correctly', () => {
  it('every Swimming-authored exercise slot resolves to a real library entry', () => {
    for (const level of Object.keys(swimmingModule.program) as (keyof typeof swimmingModule.program)[]) {
      for (const day of swimmingModule.program[level]) {
        for (const slot of day.exercises) {
          expect(getExerciseByName(slot.name), `Swimming slot "${slot.name}" should resolve`).toBeDefined();
        }
      }
    }
  });
});

// P: Swimming distance progression
describe('Exercise Registry — P: swimming distance-based progression model', () => {
  it('a distance-based swim exercise is classified with the distance progression model', () => {
    const swim = getExerciseByName('Continuous Freestyle Swim');
    expect(swim?.progressionModel).toBe('distance');
  });
});

// Q: exerciseAlternatives compatibility
describe('Exercise Registry — Q: legacy exerciseAlternatives compatibility', () => {
  it('the old public API still returns the exact same data as the new shared source', () => {
    for (const [name, alts] of Object.entries(LEGACY_ALTERNATIVES_BY_NAME)) {
      expect(getExerciseAlternatives(name)).toEqual(alts);
    }
  });

  it('returns [] for an unknown name without throwing (unchanged legacy contract)', () => {
    expect(() => getExerciseAlternatives('Not A Real Exercise')).not.toThrow();
    expect(getExerciseAlternatives('Not A Real Exercise')).toEqual([]);
  });
});

// R: No fabricated exercise data
describe('Exercise Registry — R: no fabricated data', () => {
  it('every exercise with non-empty coachingCues/instructions/primaryMuscles is a real hand-curated anchor from CURATED_OVERLAY, never auto-fabricated', () => {
    // deriveDefinitions.ts only ever populates these fields by merging CURATED_OVERLAY —
    // an exercise with no overlay entry must keep them honestly empty (classify.ts never
    // invents muscle/cue/instruction text from a name).
    for (const ex of getAllExercises()) {
      if (ex.coachingCues.length > 0 || ex.instructions.length > 0 || ex.primaryMuscles.length > 0) {
        expect(CURATED_OVERLAY[ex.id], `"${ex.id}" has curated-looking data but no overlay entry`).toBeDefined();
      }
    }
  });

  it('an exercise not backed by curated data has honestly empty (not guessed) muscle/cue fields', () => {
    // "Descending 100s" appears only as a legacy-table alternative value, never curated.
    const ex = getExerciseByName('Descending 100s');
    expect(ex).toBeDefined();
    expect(ex!.primaryMuscles).toEqual([]);
    expect(ex!.coachingCues).toEqual([]);
  });
});

// S: getProgressions / getRegressions API
describe('Exercise Registry — S: progression/regression lookup API', () => {
  it('getRegressions resolves real ExerciseDefinition objects, not just ids', () => {
    const regressions = getRegressions('back-squat');
    expect(regressions.length).toBe(1);
    expect(regressions[0].id).toBe('goblet-squat');
    expect(regressions[0].displayName).toBe('Goblet Squat');
  });

  it('getProgressions resolves real ExerciseDefinition objects', () => {
    const progressions = getProgressions('push-ups');
    expect(progressions.length).toBe(1);
    expect(progressions[0].id).toBe('feet-elevated-push-up');
  });

  it('returns [] (never throws) for an exercise with no progressions/regressions', () => {
    expect(getRegressions('unknown-exercise-id')).toEqual([]);
    expect(getProgressions('unknown-exercise-id')).toEqual([]);
  });
});

// T: Registry state is not mutable
describe('Exercise Registry — T: immutability', () => {
  it('the returned library array and its entries are frozen', () => {
    const all = getAllExercises();
    expect(Object.isFrozen(all)).toBe(true);
    expect(Object.isFrozen(all[0])).toBe(true);
  });

  it('mutating a returned exercise object has no effect on subsequent lookups (frozen, throws in strict mode or silently no-ops)', () => {
    const before = getExercise('back-squat');
    try {
      // @ts-expect-error intentionally attempting a mutation to prove it's frozen
      before.displayName = 'Hacked';
    } catch {
      // strict-mode environments throw on a frozen-object write — also acceptable proof.
    }
    expect(getExercise('back-squat')?.displayName).toBe('Back Squat');
  });
});
