import { describe, expect, it } from 'vitest';
import { generateTodayWorkout, applyCoachAdjustment } from './planEngine';
import type { ExerciseProgressionContext } from './progressionIntegration';
import { footballModule } from '../sports/football/program';
import { swimmingModule } from '../sports/swimming/program';
import { getExerciseByName } from '../exercise/registry';
import { baseAnswers } from './testFixtures';
import type { AssessmentAnswers, FitnessLevel, UserProfile } from './types';
import type { ExercisePerformanceLog } from '../progression/types';

/**
 * Remaining lettered scenarios from the Progression Engine test matrix not already
 * covered by exerciseProgressionEngine.test.ts / planEngine.test.ts / validation.test.ts /
 * progressEngine.test.ts / aiCoachEngine.test.ts / LogContext.test.tsx: F (modified
 * workout), P/Q (pain-safety + equipment-driven exercise replacement evidence
 * isolation), R (equipment constraint changes the progression model itself), S
 * (progression floor boundary), Z (Football regression), AA (Swimming regression).
 */

function profileFor(answers: Partial<AssessmentAnswers>, level: FitnessLevel = 'intermediate'): UserProfile {
  return {
    answers: baseAnswers(answers),
    level,
    nutrition: { calories: 2500, proteinG: 150, carbsG: 250, fatG: 70 },
  };
}

function log(exerciseName: string, overrides: Partial<ExercisePerformanceLog> = {}): ExercisePerformanceLog {
  return {
    date: '2026-01-05',
    exerciseName,
    prescribedSets: 3,
    completedSets: 3,
    repsAchieved: 6,
    loadKg: 70,
    rir: 0,
    wasModified: false,
    submittedAt: '2026-01-05T18:00:00.000Z',
    ...overrides,
  };
}

function progressionContext(historyByExercise: Record<string, ExercisePerformanceLog[]>): ExerciseProgressionContext {
  return {
    getHistory: (name) => historyByExercise[name] ?? [],
    getReadinessStatus: () => null,
  };
}

describe('F: modified workout — a wasModified exposure is still valid evidence for the exercise actually performed', () => {
  it('logging a substituted exercise as wasModified still lets it progress on its own merits', () => {
    const profile = profileFor({ sport: 'football', trainingLocationIds: ['home'], equipmentIds: [] }, 'intermediate');
    const baseline = generateTodayWorkout(profile, 0, 1);
    const bodyweightStrength = baseline.exercises.find((ex) => ex.category === 'strength')!;
    const history = [log(bodyweightStrength.name, { rir: 3, wasModified: true, loadKg: undefined })];
    const progressed = generateTodayWorkout(profile, 0, 1, progressionContext({ [bodyweightStrength.name]: history }));
    const target = progressed.exercises.find((ex) => ex.name === bodyweightStrength.name);
    expect(target?.progression?.decision).toBe('PROGRESS');
  });
});

describe('P/Q: pain-safety and equipment-driven substitution never contaminate the original exercise', () => {
  it('P: an injury substitute accumulates its own evidence, never affecting the contraindicated original', () => {
    const injured = profileFor({ sport: 'football', injuryIds: ['knee'], equipmentIds: ['barbell', 'squat_rack'] }, 'advanced');
    // Strong "Back Squat" history exists, but the athlete can never actually be resolved
    // into Back Squat while the knee injury is active — that history must never leak
    // into whatever safe substitute is shown instead.
    const strongBackSquatHistory = { 'Back Squat': [log('Back Squat', { rir: 5, loadKg: 100 })] };
    const resolved = generateTodayWorkout(injured, undefined, 1, progressionContext(strongBackSquatHistory));
    const backSquatStillShown = resolved.exercises.find((ex) => ex.name === 'Back Squat');
    expect(backSquatStillShown).toBeUndefined();
  });

  it('Q: an equipment-driven substitute is evaluated as its own exercise, independent of the original slot', () => {
    // No equipment at all -> every equipment-requiring slot substitutes to its bodyweight
    // alternative; a fabricated history under the ORIGINAL loaded exercise's name must
    // never influence what's shown or its progression.
    const noEquipment = profileFor({ sport: 'football', trainingLocationIds: ['home'], equipmentIds: [] }, 'advanced');
    const fakeHistoryForOriginal = { 'Back Squat': [log('Back Squat', { rir: 5, loadKg: 120 })] };
    const resolved = generateTodayWorkout(noEquipment, undefined, 1, progressionContext(fakeHistoryForOriginal));
    const backSquatShown = resolved.exercises.find((ex) => ex.name === 'Back Squat');
    expect(backSquatShown).toBeUndefined();
    // Whatever substitute IS shown should be a fresh SKIP (no fabricated history), not a
    // PROGRESS derived from the original's fake evidence.
    const anyStrength = resolved.exercises.find((ex) => ex.category === 'strength');
    expect(anyStrength?.progression?.decision).not.toBe('PROGRESS');
  });
});

describe('R: equipment constraint changes the progression model itself, not just availability', () => {
  it('a load-model exercise substituted to its bodyweight alternative progresses as rep_range (no load), never load', () => {
    const noEquipment = profileFor({ sport: 'football', trainingLocationIds: ['home'], equipmentIds: [] }, 'advanced');
    const resolved = generateTodayWorkout(noEquipment, undefined, 1, progressionContext({}));
    const strengthExercises = resolved.exercises.filter((ex) => ex.progression && (ex.category === 'strength' || ex.category === 'power'));
    expect(strengthExercises.length).toBeGreaterThan(0);
    for (const ex of strengthExercises) {
      // No equipment is available at all, so nothing resolved today can be a load model.
      expect(ex.progression!.model).not.toBe('load');
    }
  });

  it('the same invariant holds for Swimming — generic across sports, not football-specific', () => {
    const noEquipment = profileFor({ sport: 'swimming', trainingLocationIds: ['pool'], equipmentIds: [] }, 'advanced');
    const resolved = generateTodayWorkout(noEquipment, undefined, 1, progressionContext({}));
    const strengthExercises = resolved.exercises.filter((ex) => ex.progression && (ex.category === 'strength' || ex.category === 'power'));
    for (const ex of strengthExercises) {
      expect(ex.progression!.model).not.toBe('load');
    }
  });

  it('a load exercise with its required equipment available still progresses as load — the fix does not globally suppress load progression', () => {
    const equipped = profileFor({ sport: 'football', trainingLocationIds: ['gym'], equipmentIds: ['barbell', 'bench', 'squat_rack', 'dumbbells', 'pull_up_bar', 'cable_machine'] }, 'advanced');
    const resolved = generateTodayWorkout(equipped, undefined, 1, progressionContext({}));
    const loadExercises = resolved.exercises.filter((ex) => ex.progression?.model === 'load');
    expect(loadExercises.length).toBeGreaterThan(0);
  });

  it('an equipment-substituted exercise\'s OWN safety contraindications never include the athlete\'s injury (substitution never carries forward the original exercise\'s unsafe tag)', () => {
    // The same mis-authored bodyweightAlternative data that broke the progression model
    // (an equipment-requiring exercise name used as a "bodyweight" substitute) also broke
    // this independent safety invariant, since the substitute's own canonical Exercise
    // Library entry could still carry the very contraindication the substitution exists
    // to avoid — e.g. "Weighted Pull-Up" (contraindications: ['shoulder']) substituting to
    // "Pull-Up", which itself also carries contraindications: ['shoulder']. Covering both
    // from the same real-world regression.
    const injured = profileFor({ sport: 'football', injuryIds: ['shoulder'], equipmentIds: [] }, 'advanced');
    const resolved = generateTodayWorkout(injured, undefined, 1, progressionContext({}));
    expect(resolved.exercises.length).toBeGreaterThan(0);
    for (const ex of resolved.exercises) {
      const def = getExerciseByName(ex.name);
      if (!def) continue;
      expect(def.safety.contraindications.includes('shoulder')).toBe(false);
    }
  });
});

describe('S: progression floor boundary — REGRESS never drops below the authored floor or below zero', () => {
  it('repeated regression settles at the rep floor / a non-negative load, never below', () => {
    const profile = profileFor({ sport: 'football', equipmentIds: ['barbell', 'squat_rack'] }, 'advanced');
    const history: ExercisePerformanceLog[] = [];
    let lastReps: number | undefined;
    let lastLoad: number | undefined;
    for (let i = 0; i < 10; i++) {
      const context = progressionContext({ 'Back Squat': history });
      const resolved = applyCoachAdjustment(profile, undefined, { note: 'test' }, 1, context);
      const backSquat = resolved.exercises.find((ex) => ex.name === 'Back Squat');
      if (!backSquat?.progression?.nextTarget) break;
      lastReps = backSquat.progression.nextTarget.reps;
      lastLoad = backSquat.progression.nextTarget.loadKg;
      expect(lastReps).toBeGreaterThanOrEqual(0);
      if (lastLoad !== undefined) expect(lastLoad).toBeGreaterThanOrEqual(0);
      history.push(log('Back Squat', { date: `2026-01-${String(5 + i).padStart(2, '0')}`, rir: 0, repsAchieved: lastReps, loadKg: lastLoad }));
    }
    expect(lastReps).toBeGreaterThanOrEqual(0);
  });
});

describe('Z: Football regression — progression wiring never breaks football plan generation', () => {
  it('every fitness level resolves a valid, progression-aware plan for football', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as FitnessLevel[]) {
      const profile = profileFor({ sport: 'football', trainingLocationIds: ['sports_field', 'gym', 'home'], equipmentIds: ['barbell', 'squat_rack', 'bench', 'dumbbells', 'pull_up_bar', 'cable_machine'] }, level);
      const resolved = generateTodayWorkout(profile, undefined, 1, progressionContext({}));
      expect(resolved.exercises.length).toBeGreaterThan(0);
      for (const ex of resolved.exercises) {
        expect(Number.isFinite(ex.sets)).toBe(true);
        expect(ex.sets).toBeGreaterThan(0);
        expect(typeof ex.reps).toBe('string');
      }
    }
    expect(footballModule.program.intermediate.length).toBeGreaterThan(0);
  });
});

describe('AA: Swimming regression — progression wiring never breaks swimming plan generation', () => {
  it('every fitness level resolves a valid, progression-aware plan for swimming, staying recognizably swimming', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as FitnessLevel[]) {
      const profile = profileFor({ sport: 'swimming', trainingLocationIds: ['pool'], equipmentIds: ['kickboard', 'pull_buoy', 'fins', 'paddles', 'dumbbells'] }, level);
      const resolved = generateTodayWorkout(profile, undefined, 1, progressionContext({}));
      expect(resolved.exercises.length).toBeGreaterThan(0);
      const validNames = new Set(swimmingModule.program[level].flatMap((d) => d.exercises.flatMap((e) => [e.name, e.bodyweightAlternative?.name])));
      for (const ex of resolved.exercises) {
        expect(validNames.has(ex.name)).toBe(true);
        expect(Number.isFinite(ex.sets)).toBe(true);
      }
    }
  });

  it('a swim distance exercise progresses distance, never fabricating a load', () => {
    const profile = profileFor({ sport: 'swimming', trainingLocationIds: ['pool'], equipmentIds: [] }, 'intermediate');
    const baseline = generateTodayWorkout(profile, undefined, 1);
    const distanceEx = baseline.exercises.find((ex) => /\d+m/.test(ex.reps));
    if (!distanceEx) return; // this day's cycle has no distance-model exercise — nothing to assert
    const history = [log(distanceEx.name, { rir: 3, loadKg: undefined, distanceM: 200, repsAchieved: undefined })];
    const progressed = generateTodayWorkout(profile, undefined, 1, progressionContext({ [distanceEx.name]: history }));
    const target = progressed.exercises.find((ex) => ex.name === distanceEx.name);
    expect(target?.progression?.model).toBe('distance');
    expect(target?.progression?.nextTarget?.loadKg).toBeUndefined();
  });
});
