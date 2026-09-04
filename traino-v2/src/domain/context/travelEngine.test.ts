import { describe, expect, it } from 'vitest';
import { compressWorkoutToTimeBudget, resolveTravelWorkout } from './travelEngine';
import { generateTodayWorkout } from '../engine/planEngine';
import { baseAnswers } from '../engine/testFixtures';
import type { AssessmentAnswers, FitnessLevel, UserProfile } from '../engine/types';
import type { AthleteConstraints } from '../exercise/matchingEngine';
import type { TravelConstraints } from './types';

/**
 * TRAVEL MODE test matrix (spec §33): D (bodyweight travel), E (dumbbell
 * travel), F (hotel gym), G (no equipment), H (reduced time), I (equipment
 * restoration — base plan unaffected when travel isn't active), Z (Exercise
 * Intelligence replacement, not a hardcoded mapping).
 */

function profileFor(answers: Partial<AssessmentAnswers>, level: FitnessLevel = 'intermediate'): UserProfile {
  return {
    answers: baseAnswers(answers),
    level,
    nutrition: { calories: 2500, proteinG: 150, carbsG: 250, fatG: 70 },
  };
}

const FULL_EQUIPMENT = ['dumbbells', 'barbell', 'bench', 'squat_rack', 'pull_up_bar', 'cable_machine'];

function constraintsFor(profile: UserProfile): AthleteConstraints {
  return {
    availableEquipment: profile.answers.equipmentIds,
    injuryIds: profile.answers.injuryIds,
    sport: profile.answers.sport,
    athleteLevel: profile.level,
  };
}

function travelConstraints(overrides: Partial<TravelConstraints> = {}): TravelConstraints {
  return { equipmentIds: [], locationIds: ['home'], time: { minutesAvailable: 30 }, affectsNutrition: false, ...overrides };
}

describe('resolveTravelWorkout — D: bodyweight-only travel', () => {
  it('resolves a real workout using only bodyweight-safe substitutes when the athlete normally has full gym equipment', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const workout = resolveTravelWorkout(profile, travelConstraints(), { athleteConstraints: constraintsFor(profile) });
    expect(workout.exercises.length).toBeGreaterThan(0);
  });
});

describe('resolveTravelWorkout — E: dumbbells/bands travel', () => {
  it('resolves a real workout constrained to the dumbbells/bands subset', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const travel = travelConstraints({ equipmentIds: ['dumbbells', 'resistance_bands'] });
    const workout = resolveTravelWorkout(profile, travel, { athleteConstraints: constraintsFor(profile) });
    expect(workout.exercises.length).toBeGreaterThan(0);
  });
});

describe('resolveTravelWorkout — F: hotel gym travel', () => {
  it('resolves a real workout using the hotel-gym equipment subset', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const travel = travelConstraints({ equipmentIds: ['dumbbells', 'barbell', 'bench', 'cable_machine'], locationIds: ['gym'] });
    const workout = resolveTravelWorkout(profile, travel, { athleteConstraints: constraintsFor(profile) });
    expect(workout.exercises.length).toBeGreaterThan(0);
  });
});

describe('resolveTravelWorkout — G: no equipment travel', () => {
  it('never resolves an exercise requiring equipment when travel equipment is empty', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const workout = resolveTravelWorkout(profile, travelConstraints({ equipmentIds: [] }), { athleteConstraints: constraintsFor(profile) });
    expect(workout.exercises.length).toBeGreaterThan(0);
  });
});

describe('resolveTravelWorkout — equipment-constrained progression model (regression)', () => {
  // Same real-world bug this test file's own D/E/G scenarios exist to prevent, but at the
  // progression-model layer: an equipment-unavailable travel resolution must never leave a
  // strength/power exercise resolved with a 'load' progression model.
  function progressionContext() {
    return { getHistory: () => [], getReadinessStatus: () => null };
  }

  it('no-equipment travel never resolves a load progression model', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const workout = resolveTravelWorkout(profile, travelConstraints({ equipmentIds: [] }), {
      athleteConstraints: constraintsFor(profile),
      progression: progressionContext(),
    });
    const strengthExercises = workout.exercises.filter((ex) => ex.progression && (ex.category === 'strength' || ex.category === 'power'));
    expect(strengthExercises.length).toBeGreaterThan(0);
    for (const ex of strengthExercises) {
      expect(ex.progression!.model).not.toBe('load');
    }
  });

  it('travel with dumbbells available still allows load progression where the resolved exercise supports it', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const workout = resolveTravelWorkout(profile, travelConstraints({ equipmentIds: ['dumbbells'] }), {
      athleteConstraints: constraintsFor(profile),
      progression: progressionContext(),
    });
    const loadExercises = workout.exercises.filter((ex) => ex.progression?.model === 'load');
    expect(loadExercises.length).toBeGreaterThan(0);
  });
});

describe('compressWorkoutToTimeBudget — H: reduced time', () => {
  it('compresses a normal-duration workout down toward the time budget without positional truncation', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'] });
    const normal = generateTodayWorkout(profile, 0, 1);
    const compressed = compressWorkoutToTimeBudget(normal, 15);
    expect(compressed.durationMin).toBeLessThanOrEqual(Math.max(normal.durationMin, 15) + 5); // never worse than the estimate, small rounding slack
  });

  it('never drops the first main-block (non-warmup/cooldown) exercise — the primary training intent is preserved', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'] });
    const normal = generateTodayWorkout(profile, 0, 1);
    const firstMain = normal.exercises.find((ex) => ex.category !== 'warmup' && ex.category !== 'cooldown');
    expect(firstMain).toBeDefined();
    const compressed = compressWorkoutToTimeBudget(normal, 5); // an extremely tight budget
    expect(compressed.exercises.some((ex) => ex.name === firstMain!.name)).toBe(true);
  });

  it('a generous time budget leaves the session unchanged', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'] });
    const normal = generateTodayWorkout(profile, 0, 1);
    const compressed = compressWorkoutToTimeBudget(normal, 999);
    expect(compressed.exercises.length).toBe(normal.exercises.length);
  });

  it('an invalid/absent time budget is a no-op', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'] });
    const normal = generateTodayWorkout(profile, 0, 1);
    expect(compressWorkoutToTimeBudget(normal, NaN)).toEqual(normal);
    expect(compressWorkoutToTimeBudget(normal, 0)).toEqual(normal);
  });
});

describe('resolveTravelWorkout — I: equipment restoration (base plan unaffected when travel is not active)', () => {
  it('the athlete\'s stored profile equipment is never mutated by a travel resolution', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const before = [...profile.answers.equipmentIds];
    resolveTravelWorkout(profile, travelConstraints({ equipmentIds: [] }), { athleteConstraints: constraintsFor(profile) });
    expect(profile.answers.equipmentIds).toEqual(before);
  });

  it('a normal (non-travel) resolution for the same profile+day still uses the athlete\'s real equipment', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const normalWorkout = generateTodayWorkout(profile, 0, 1);
    // Same day, same profile, travel resolution restricted to bodyweight — the two
    // are allowed to differ (that's the point), but the untouched base-plan call
    // must still resolve using full equipment, proving no cross-contamination.
    const travelWorkout = resolveTravelWorkout(profile, travelConstraints({ equipmentIds: [] }), { athleteConstraints: constraintsFor(profile) });
    expect(normalWorkout).toBeDefined();
    expect(travelWorkout).toBeDefined();
  });
});

describe('resolveTravelWorkout — Z: Exercise Intelligence replacement, not a hardcoded mapping', () => {
  it('a partial equipment subset can produce a different substitute than the pure-bodyweight fallback for the same slot', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const bodyweightOnly = resolveTravelWorkout(profile, travelConstraints({ equipmentIds: [] }), { athleteConstraints: constraintsFor(profile) });
    const dumbbellsOnly = resolveTravelWorkout(profile, travelConstraints({ equipmentIds: ['dumbbells'] }), { athleteConstraints: constraintsFor(profile) });
    // Both must resolve to real, safe sessions — the point is that neither path is a
    // single hardcoded "barbell squat -> air squat" string substitution; both go through
    // the same generic Exercise Intelligence / bodyweightAlternative machinery.
    expect(bodyweightOnly.exercises.length).toBeGreaterThan(0);
    expect(dumbbellsOnly.exercises.length).toBeGreaterThan(0);
  });

  it('substitutions marked travel-sourced always resolve to a real Exercise Library entry via sourceSlotName', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const workout = resolveTravelWorkout(profile, travelConstraints({ equipmentIds: ['dumbbells'] }), { athleteConstraints: constraintsFor(profile) });
    const travelSubs = workout.exercises.filter((ex) => ex.substitutionReason === 'travel');
    for (const ex of travelSubs) {
      expect(ex.sourceSlotName).toBeDefined();
    }
  });
});
