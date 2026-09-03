import { describe, expect, it } from 'vitest';
import { assertValidSportModule, validateSportModule } from './validateSportModule';
import { footballModule } from './football/program';
import { genericModule } from './generic/program';
import type { SportModuleData } from '../engine/types';

function validModule(): SportModuleData {
  const day = {
    id: 'day_a',
    name: 'Full Body A',
    focus: 'General',
    intensity: 'Low' as const,
    durationMin: 30,
    statCategory: 'strength' as const,
    exercises: [{ name: 'Push-Ups', sets: 3, reps: '10', equipment: [], category: 'strength' as const }],
  };
  return {
    id: 'football',
    program: { beginner: [day], intermediate: [day], advanced: [day] },
    nutritionProfile: { proteinGPerKg: 1.8, carbBias: 'moderate' },
  };
}

describe('validateSportModule — Sport Module contract', () => {
  it('the real football module already satisfies the contract', () => {
    expect(validateSportModule(footballModule)).toEqual({ valid: true, errors: [] });
  });

  it('the generic fallback module already satisfies the contract', () => {
    expect(validateSportModule(genericModule)).toEqual({ valid: true, errors: [] });
  });

  it('a minimal well-formed module passes', () => {
    expect(validateSportModule(validModule())).toEqual({ valid: true, errors: [] });
  });

  it('rejects a module missing an experience level\'s training templates', () => {
    const module = validModule();
    module.program.advanced = [];
    const result = validateSportModule(module);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('program.advanced'))).toBe(true);
  });

  it('rejects a day template missing statCategory', () => {
    const module = validModule();
    // @ts-expect-error deliberately malformed for the test
    module.program.beginner[0].statCategory = undefined;
    const result = validateSportModule(module);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('statCategory'))).toBe(true);
  });

  it('rejects an exercise slot with an invalid category', () => {
    const module = validModule();
    // @ts-expect-error deliberately malformed for the test
    module.program.beginner[0].exercises[0].category = 'not_a_category';
    const result = validateSportModule(module);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('category'))).toBe(true);
  });

  it('rejects an exercise slot with non-positive sets', () => {
    const module = validModule();
    module.program.beginner[0].exercises[0].sets = 0;
    const result = validateSportModule(module);
    expect(result.valid).toBe(false);
  });

  it('flags a blockable slot (requires equipment) with no bodyweight alternative', () => {
    const module = validModule();
    module.program.beginner[0].exercises[0].equipment = ['barbell'];
    const result = validateSportModule(module);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('bodyweightAlternative'))).toBe(true);
  });

  it('rejects a module with no nutritionProfile', () => {
    const module = validModule();
    // @ts-expect-error deliberately malformed for the test
    module.nutritionProfile = undefined;
    const result = validateSportModule(module);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nutritionProfile'))).toBe(true);
  });

  it('rejects a module missing an id', () => {
    const module = validModule();
    // @ts-expect-error deliberately malformed for the test
    module.id = '';
    const result = validateSportModule(module);
    expect(result.valid).toBe(false);
  });

  it('collects every violation in one pass rather than stopping at the first', () => {
    const module = validModule();
    module.program.advanced = [];
    // @ts-expect-error deliberately malformed for the test
    module.nutritionProfile = undefined;
    const result = validateSportModule(module);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('assertValidSportModule — fail-fast registration gate', () => {
  it('does not throw for a valid module', () => {
    expect(() => assertValidSportModule(validModule())).not.toThrow();
  });

  it('regression: throws with every violation listed for a malformed module, so it fails at registration/build/test time rather than reaching an athlete at runtime', () => {
    const module = validModule();
    module.program.advanced = [];
    expect(() => assertValidSportModule(module)).toThrow(/program\.advanced/);
  });
});
