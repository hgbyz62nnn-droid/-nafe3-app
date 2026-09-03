import { describe, expect, it } from 'vitest';
import { applyCoachAdjustment, generateTodayWorkout } from './planEngine';
import { computeReadiness } from './readinessEngine';
import { sanitizeReadinessInputs } from './validation';
import { footballModule } from '../sports/football/program';
import { swimmingModule } from '../sports/swimming/program';
import { baseAnswers } from './testFixtures';
import type { AssessmentAnswers, FitnessLevel, UserProfile } from './types';
import type { DailyReadinessInputs } from '../readiness/types';

/**
 * Integration tests for the Daily Readiness System's effect on real, sport-resolved
 * plans — verifies the readiness engine's output composes correctly with the existing
 * injury/contraindication architecture and `applyCoachAdjustment`, exactly the
 * generic mechanisms every other plan-modifying feature (AI Coach chat, Weekly
 * Coaching) already reuses. Nothing here is sport-specific: the same test bodies run
 * for football and swimming.
 */

function profileFor(answers: Partial<AssessmentAnswers>, level: FitnessLevel = 'intermediate'): UserProfile {
  return {
    answers: baseAnswers(answers),
    level,
    nutrition: { calories: 2500, proteinG: 150, carbsG: 250, fatG: 70 },
  };
}

function readinessInputs(overrides: Partial<DailyReadinessInputs> = {}): DailyReadinessInputs {
  return {
    sleepQuality: 3, sleepDurationBucket: 3, energy: 3, stress: 3, soreness: 3, motivation: 3, painFlag: false,
    ...overrides,
  };
}

const LOW_READINESS_INPUTS = readinessInputs({ energy: 1, sleepQuality: 1, sleepDurationBucket: 1, stress: 5, soreness: 5 });
const PAIN_INPUTS = readinessInputs({ painFlag: true });

describe('Readiness -> Today\'s Workout integration (J-N)', () => {
  it('J: an existing injury contraindication is still respected under a readiness pain-safe adjustment', () => {
    const profile = profileFor({ sport: 'football', injuryIds: ['knee'] }, 'advanced');
    const { recommendation } = computeReadiness(sanitizeReadinessInputs(PAIN_INPUTS).value);
    const workout = applyCoachAdjustment(profile, undefined, recommendation.trainingAdjustment!, 1);
    const kneeContraindicated = footballModule.program.advanced.flatMap((d) => d.exercises).filter((e) => e.contraindications?.includes('knee'));
    for (const slot of kneeContraindicated) {
      const stillPresent = workout.exercises.some((ex) => ex.name === slot.name);
      expect(stillPresent).toBe(false);
    }
  });

  it('K: a reduced-readiness adjustment measurably lowers today\'s workout volume', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const base = generateTodayWorkout(profile, 0, 1);
    const { recommendation } = computeReadiness(sanitizeReadinessInputs(LOW_READINESS_INPUTS).value);
    expect(recommendation.trainingAdjustment).toBeDefined();
    const adjusted = applyCoachAdjustment(profile, 0, recommendation.trainingAdjustment!, 1);
    const baseSets = base.exercises.filter((e) => e.category !== 'warmup' && e.category !== 'cooldown').reduce((s, e) => s + e.sets, 0);
    const adjustedSets = adjusted.exercises.filter((e) => e.category !== 'warmup' && e.category !== 'cooldown').reduce((s, e) => s + e.sets, 0);
    expect(adjustedSets).toBeLessThan(baseSets);
  });

  it('L: session intent is preserved — name/focus/statCategory unchanged; no new exercise category is introduced', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const base = generateTodayWorkout(profile, 0, 1);
    const { recommendation } = computeReadiness(sanitizeReadinessInputs(LOW_READINESS_INPUTS).value);
    const adjusted = applyCoachAdjustment(profile, 0, recommendation.trainingAdjustment!, 1);
    expect(adjusted.name).toBe(base.name);
    expect(adjusted.focus).toBe(base.focus);
    expect(adjusted.statCategory).toBe(base.statCategory);
    // A recovery-status adjustment may legitimately DROP a high-impact slot (via
    // skipHighImpact — the same safety mechanism AI Coach's "have_pain" already uses),
    // but it must never introduce an exercise category that wasn't already in the base
    // session — that would mean the session's actual intent changed, not just its volume.
    const baseCategories = new Set(base.exercises.map((e) => e.category));
    const adjustedCategories = new Set(adjusted.exercises.map((e) => e.category));
    for (const category of adjustedCategories) {
      expect(baseCategories.has(category)).toBe(true);
    }
  });

  it('L: a recovery-status adjustment never converts a strength/power session into conditioning', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const strengthDayIndex = footballModule.program.intermediate.findIndex((d) =>
      d.exercises.some((e) => e.category === 'strength')
    );
    expect(strengthDayIndex).toBeGreaterThanOrEqual(0);
    const base = generateTodayWorkout(profile, strengthDayIndex, 1);
    const { status, recommendation } = computeReadiness(sanitizeReadinessInputs(LOW_READINESS_INPUTS).value);
    expect(status).toBe('recovery');
    const adjusted = applyCoachAdjustment(profile, strengthDayIndex, recommendation.trainingAdjustment!, 1);
    const baseHasStrength = base.exercises.some((e) => e.category === 'strength');
    const adjustedHasStrength = adjusted.exercises.some((e) => e.category === 'strength');
    expect(adjustedHasStrength).toBe(baseHasStrength);
  });

  it('M: football integration — a readiness adjustment resolves against the football program without error', () => {
    const profile = profileFor({ sport: 'football' }, 'beginner');
    const { recommendation } = computeReadiness(sanitizeReadinessInputs(LOW_READINESS_INPUTS).value);
    expect(() => applyCoachAdjustment(profile, undefined, recommendation.trainingAdjustment!, 1)).not.toThrow();
    const adjusted = applyCoachAdjustment(profile, undefined, recommendation.trainingAdjustment!, 1);
    expect(adjusted.exercises.length).toBeGreaterThan(0);
  });

  it('N: swimming integration — a readiness adjustment resolves against the swimming program, staying recognizably swimming', () => {
    const profile = profileFor({ sport: 'swimming', trainingLocationIds: ['pool'], equipmentIds: ['pool'] }, 'beginner');
    const base = generateTodayWorkout(profile, 0, 1);
    const { recommendation } = computeReadiness(sanitizeReadinessInputs(LOW_READINESS_INPUTS).value);
    expect(() => applyCoachAdjustment(profile, 0, recommendation.trainingAdjustment!, 1)).not.toThrow();
    const adjusted = applyCoachAdjustment(profile, 0, recommendation.trainingAdjustment!, 1);
    expect(adjusted.name).toBe(base.name);
    expect(adjusted.statCategory).toBe(base.statCategory);
    // The swim program's own day template is still the source of every exercise name —
    // no generic/other-sport exercise was substituted in by the readiness adjustment.
    const validNames = new Set(swimmingModule.program.beginner.flatMap((d) => d.exercises.flatMap((e) => [e.name, e.bodyweightAlternative?.name])));
    for (const ex of adjusted.exercises) {
      expect(validNames.has(ex.name)).toBe(true);
    }
  });

  it('high/normal readiness never applies any adjustment (no silent modification)', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const base = generateTodayWorkout(profile, 0, 1);
    const { recommendation } = computeReadiness(sanitizeReadinessInputs(readinessInputs({ energy: 5, sleepQuality: 5, stress: 1, soreness: 1 })).value);
    expect(recommendation.adjustmentApplied).toBe(false);
    expect(recommendation.trainingAdjustment).toBeUndefined();
    const stillBase = generateTodayWorkout(profile, 0, 1);
    expect(stillBase).toEqual(base);
  });
});

describe('Combination scenarios (spec section 16)', () => {
  it('poor sleep + low energy -> reduced/recovery status with a real volume cut', () => {
    const { status, recommendation } = computeReadiness(
      sanitizeReadinessInputs(readinessInputs({ sleepQuality: 1, sleepDurationBucket: 1, energy: 1 })).value
    );
    expect(['reduced', 'recovery']).toContain(status);
    expect(recommendation.adjustmentApplied).toBe(true);
  });

  it('good sleep + high stress -> a valid bounded score, no crash', () => {
    const result = computeReadiness(sanitizeReadinessInputs(readinessInputs({ sleepQuality: 5, sleepDurationBucket: 5, stress: 5 })).value);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('high soreness + high motivation -> soreness still pulls the score down from a neutral baseline', () => {
    const baseline = computeReadiness(sanitizeReadinessInputs(readinessInputs()).value);
    const sore = computeReadiness(sanitizeReadinessInputs(readinessInputs({ soreness: 5, motivation: 5 })).value);
    expect(sore.score).toBeLessThan(baseline.score);
  });

  it('low readiness + injury flag -> recovery status with the pain-safe adjustment, not the generic reduced one', () => {
    const { status, recommendation } = computeReadiness(
      sanitizeReadinessInputs(readinessInputs({ energy: 1, sleepQuality: 1, painFlag: true })).value
    );
    expect(status).toBe('recovery');
    expect(recommendation.trainingAdjustment?.swapToBodyweight).toBe(true);
    expect(recommendation.trainingAdjustment?.skipHighImpact).toBe(true);
  });

  it('high readiness is independent of any separate workout-history signal (readiness never reads log history)', () => {
    const a = computeReadiness(sanitizeReadinessInputs(readinessInputs({ energy: 5, sleepQuality: 5, stress: 1, soreness: 1 })).value);
    const b = computeReadiness(sanitizeReadinessInputs(readinessInputs({ energy: 5, sleepQuality: 5, stress: 1, soreness: 1 })).value);
    expect(a).toEqual(b);
    expect(a.status).toBe('high');
  });

  it('repeated low readiness over multiple days always produces the same conservative result each day', () => {
    const days = Array.from({ length: 5 }, () => computeReadiness(sanitizeReadinessInputs(LOW_READINESS_INPUTS).value));
    for (const day of days) {
      expect(day.status).toBe('recovery');
      expect(day.recommendation.adjustmentApplied).toBe(true);
    }
    expect(new Set(days.map((d) => d.score)).size).toBe(1);
  });
});
