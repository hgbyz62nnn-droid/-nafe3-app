import { describe, expect, it } from 'vitest';
import { ExerciseLibraryValidationError, validateExerciseLibrary } from './validateLibrary';
import type { ExerciseDefinition } from './types';

/** A minimal, otherwise-valid ExerciseDefinition — tests override only the field(s)
 * under test, so each failure case is isolated to exactly one violation. */
function makeExercise(overrides: Partial<ExerciseDefinition> = {}): ExerciseDefinition {
  return {
    id: 'test-exercise',
    canonicalName: 'Test Exercise',
    displayName: 'Test Exercise',
    aliases: [],
    category: 'strength',
    movementPattern: 'horizontal_push',
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: [],
    difficulty: 'beginner',
    trainingIntents: ['strength'],
    progressionModel: 'rep_range',
    unilateral: false,
    impactLevel: 'low',
    stabilityDemand: 'low',
    technicalDemand: 'low',
    sportRelevance: {},
    coachingCues: [],
    commonMistakes: [],
    instructions: [],
    alternativeIds: [],
    regressionIds: [],
    progressionIds: [],
    safety: { contraindications: [], highImpact: false },
    ...overrides,
  };
}

describe('validateExerciseLibrary — valid input', () => {
  it('accepts a well-formed, minimal library without throwing', () => {
    expect(() => validateExerciseLibrary([makeExercise()])).not.toThrow();
  });

  it('accepts an empty library (nothing to violate)', () => {
    expect(() => validateExerciseLibrary([])).not.toThrow();
  });

  it('accepts valid, non-self-referential alternative/regression/progression chains', () => {
    const a = makeExercise({ id: 'a', canonicalName: 'A', regressionIds: ['b'] });
    const b = makeExercise({ id: 'b', canonicalName: 'B', progressionIds: ['a'] });
    expect(() => validateExerciseLibrary([a, b])).not.toThrow();
  });
});

describe('validateExerciseLibrary — duplicate ids', () => {
  it('rejects two exercises sharing the same id', () => {
    const a = makeExercise({ id: 'dup', canonicalName: 'A' });
    const b = makeExercise({ id: 'dup', canonicalName: 'B' });
    expect(() => validateExerciseLibrary([a, b])).toThrow(ExerciseLibraryValidationError);
  });
});

describe('validateExerciseLibrary — empty canonicalName', () => {
  it('rejects an exercise with an empty canonicalName', () => {
    expect(() => validateExerciseLibrary([makeExercise({ canonicalName: '' })])).toThrow(ExerciseLibraryValidationError);
  });

  it('rejects an exercise with a whitespace-only canonicalName', () => {
    expect(() => validateExerciseLibrary([makeExercise({ canonicalName: '   ' })])).toThrow(ExerciseLibraryValidationError);
  });
});

describe('validateExerciseLibrary — invalid enum values', () => {
  it('rejects an invalid movementPattern', () => {
    const bad = makeExercise({ movementPattern: 'not_a_real_pattern' as ExerciseDefinition['movementPattern'] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });

  it('rejects an invalid difficulty', () => {
    const bad = makeExercise({ difficulty: 'expert' as ExerciseDefinition['difficulty'] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });

  it('rejects an invalid progressionModel', () => {
    const bad = makeExercise({ progressionModel: 'reps_per_minute' as ExerciseDefinition['progressionModel'] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });

  it('rejects an invalid trainingIntent', () => {
    const bad = makeExercise({ trainingIntents: ['flexibility' as ExerciseDefinition['trainingIntents'][number]] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });
});

describe('validateExerciseLibrary — equipment references', () => {
  it('rejects an unknown equipment id', () => {
    const bad = makeExercise({ equipment: ['jet_pack'] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });

  it('accepts a real, already-registered equipment id', () => {
    const ok = makeExercise({ equipment: ['barbell'] });
    expect(() => validateExerciseLibrary([ok])).not.toThrow();
  });
});

describe('validateExerciseLibrary — self-references', () => {
  it('rejects an exercise listing itself as an alternative', () => {
    const bad = makeExercise({ alternativeIds: ['test-exercise'] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });

  it('rejects an exercise listing itself as a regression', () => {
    const bad = makeExercise({ regressionIds: ['test-exercise'] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });

  it('rejects an exercise listing itself as a progression', () => {
    const bad = makeExercise({ progressionIds: ['test-exercise'] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });
});

describe('validateExerciseLibrary — unknown cross-references', () => {
  it('rejects an alternativeId that does not exist in the library', () => {
    const bad = makeExercise({ alternativeIds: ['does-not-exist'] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });

  it('rejects a regressionId that does not exist', () => {
    const bad = makeExercise({ regressionIds: ['does-not-exist'] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });

  it('rejects a progressionId that does not exist', () => {
    const bad = makeExercise({ progressionIds: ['does-not-exist'] });
    expect(() => validateExerciseLibrary([bad])).toThrow(ExerciseLibraryValidationError);
  });
});

describe('validateExerciseLibrary — ambiguous name/alias collisions', () => {
  it('rejects two different exercises whose canonicalName collides case-insensitively', () => {
    const a = makeExercise({ id: 'a', canonicalName: 'Row' });
    const b = makeExercise({ id: 'b', canonicalName: 'row' });
    expect(() => validateExerciseLibrary([a, b])).toThrow(ExerciseLibraryValidationError);
  });

  it('rejects an alias that collides with a different exercise\'s canonicalName', () => {
    const a = makeExercise({ id: 'a', canonicalName: 'Row' });
    const b = makeExercise({ id: 'b', canonicalName: 'Bent-Over Row', aliases: ['Row'] });
    expect(() => validateExerciseLibrary([a, b])).toThrow(ExerciseLibraryValidationError);
  });

  it('allows the same exercise to list multiple distinct aliases with no collision', () => {
    const a = makeExercise({ id: 'a', canonicalName: 'Bench Press', aliases: ['Barbell Bench Press', 'Flat Bench'] });
    expect(() => validateExerciseLibrary([a])).not.toThrow();
  });
});

describe('validateExerciseLibrary — accumulates all errors, not just the first', () => {
  it('a library with multiple independent violations reports more than one error message', () => {
    const a = makeExercise({ id: 'dup', canonicalName: '' });
    const b = makeExercise({ id: 'dup', canonicalName: 'B', equipment: ['not_real'] });
    try {
      validateExerciseLibrary([a, b]);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ExerciseLibraryValidationError);
      const message = (e as Error).message;
      const errorLines = message.split('\n').filter((l) => l.startsWith('- '));
      expect(errorLines.length).toBeGreaterThan(1);
    }
  });
});
