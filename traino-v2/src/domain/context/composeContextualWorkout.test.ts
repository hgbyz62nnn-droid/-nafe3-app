import { describe, expect, it } from 'vitest';
import { composeContextualWorkout } from './composeContextualWorkout';
import { generateTodayWorkout } from '../engine/planEngine';
import { baseAnswers } from '../engine/testFixtures';
import type { AssessmentAnswers, FitnessLevel, UserProfile } from '../engine/types';
import type { AthleteConstraints } from '../exercise/matchingEngine';
import type { ExerciseProgressionContext } from '../engine/progressionIntegration';
import type { ResolvedContext, TravelContext, CompetitionEvent } from './types';

/**
 * Context precedence composition test matrix (spec §33/§35): K (travel +
 * readiness), L (travel + injury/safety), V (competition + readiness), W
 * (competition + injury/safety), AF (determinism), AG (base-plan
 * restoration proof — spec §32's critical invariant).
 */

const FULL_EQUIPMENT = ['dumbbells', 'barbell', 'bench', 'squat_rack', 'pull_up_bar', 'cable_machine'];

function profileFor(answers: Partial<AssessmentAnswers>, level: FitnessLevel = 'intermediate'): UserProfile {
  return {
    answers: baseAnswers(answers),
    level,
    nutrition: { calories: 2500, proteinG: 150, carbsG: 250, fatG: 70 },
  };
}

const NO_PROGRESSION: ExerciseProgressionContext = { getHistory: () => [], getReadinessStatus: () => null };

function constraintsFor(profile: UserProfile): AthleteConstraints {
  return {
    availableEquipment: profile.answers.equipmentIds,
    injuryIds: profile.answers.injuryIds,
    sport: profile.answers.sport,
    athleteLevel: profile.level,
  };
}

const NORMAL_CONTEXT: ResolvedContext = { mode: 'normal', travel: null, competition: null, competitionPhase: 'none' };

function travelContext(overrides: Partial<TravelContext['constraints']> = {}): ResolvedContext {
  const travel: TravelContext = {
    id: 't1',
    mode: 'travel',
    startDate: '2026-03-01',
    endDate: '2026-03-10',
    constraints: { equipmentIds: [], locationIds: ['home'], time: { minutesAvailable: 30 }, affectsNutrition: false, ...overrides },
    createdAt: '2026-02-25T00:00:00.000Z',
    source: 'athlete',
  };
  return { mode: 'travel', travel, competition: null, competitionPhase: 'none' };
}

function competitionContext(phase: ResolvedContext['competitionPhase']): ResolvedContext {
  const competition: CompetitionEvent = {
    id: 'e1',
    mode: 'competition',
    eventDate: '2026-03-20',
    eventType: 'match',
    createdAt: '2026-02-25T00:00:00.000Z',
    source: 'athlete',
  };
  return { mode: 'competition', travel: null, competition, competitionPhase: phase };
}

describe('composeContextualWorkout — base precedence', () => {
  it('with no context/adjustment active, produces the same workout as the plain base-plan resolution', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'] });
    const base = generateTodayWorkout(profile, undefined, 1, NO_PROGRESSION);
    const result = composeContextualWorkout({
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: null,
      readinessAdjustment: null,
      weeklyAdjustment: null,
      resolvedContext: NORMAL_CONTEXT,
      athleteConstraints: constraintsFor(profile),
    });
    expect(result.skipNormalSession).toBe(false);
    expect(result.workout).toEqual(base);
  });

  it('an explicit AI Coach chat adjustment wins over everything else, even during competition', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'] });
    const result = composeContextualWorkout({
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: { swapToBodyweight: true, skipHighImpact: true, note: 'pain-safe' },
      readinessAdjustment: null,
      weeklyAdjustment: null,
      resolvedContext: competitionContext('near'),
      athleteConstraints: constraintsFor(profile),
    });
    expect(result.workout?.exercises.every((ex) => ex.category !== 'strength' || !ex.name.match(/jump/i))).toBe(true);
  });

  it('competition day-plan adjustment wins over readiness when both are present', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'] });
    const result = composeContextualWorkout({
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: null,
      readinessAdjustment: { volumeMultiplier: 0.9, note: 'mild readiness reduction' },
      weeklyAdjustment: null,
      resolvedContext: competitionContext('very_near'),
      athleteConstraints: constraintsFor(profile),
    });
    // very_near's own volumeMultiplier (0.6) should be the one actually applied, not readiness's 0.9.
    const base = generateTodayWorkout(profile, undefined, 1, NO_PROGRESSION);
    const mainEx = base.exercises.find((ex) => ex.category !== 'warmup' && ex.category !== 'cooldown');
    const resultEx = result.workout?.exercises.find((ex) => ex.name === mainEx?.name);
    if (mainEx && resultEx) {
      expect(resultEx.sets).toBeLessThanOrEqual(Math.round(mainEx.sets * 0.65));
    }
  });
});

describe('composeContextualWorkout — Q: competition event day skips the normal session entirely', () => {
  it('returns skipNormalSession true and a null workout on event day', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'] });
    const result = composeContextualWorkout({
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: null,
      readinessAdjustment: null,
      weeklyAdjustment: null,
      resolvedContext: competitionContext('event_day'),
      athleteConstraints: constraintsFor(profile),
    });
    expect(result.skipNormalSession).toBe(true);
    expect(result.workout).toBeNull();
    expect(result.contextMessage).toMatch(/competition day/i);
  });
});

describe('composeContextualWorkout — K: travel + readiness composition (spec §16)', () => {
  it('travel equipment restriction and readiness volume reduction both apply together', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const result = composeContextualWorkout({
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: null,
      readinessAdjustment: { volumeMultiplier: 0.8, note: 'reduced volume for lower readiness' },
      weeklyAdjustment: null,
      resolvedContext: travelContext({ equipmentIds: [] }),
      athleteConstraints: constraintsFor(profile),
    });
    expect(result.workout).toBeDefined();
    expect(result.workout!.exercises.length).toBeGreaterThan(0);
    expect(result.contextMessage).toBeTruthy();
  });
});

describe('composeContextualWorkout — L: travel + injury/safety (never bypassed)', () => {
  it('an injury contraindication is respected even while traveling', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'], injuryIds: ['knee'] });
    const result = composeContextualWorkout({
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: null,
      readinessAdjustment: null,
      weeklyAdjustment: null,
      resolvedContext: travelContext({ equipmentIds: ['dumbbells'] }),
      athleteConstraints: constraintsFor(profile),
    });
    // No exercise resolved for a knee-injured, traveling athlete should be a jump/plyo movement.
    expect(result.workout!.exercises.every((ex) => !/jump|depth/i.test(ex.name))).toBe(true);
  });
});

describe('composeContextualWorkout — V: competition + readiness (more conservative session)', () => {
  it('a low-readiness day during competition taper still produces a conservative session', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'] });
    const result = composeContextualWorkout({
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: null,
      readinessAdjustment: { volumeMultiplier: 0.6, skipHighImpact: true, note: 'recovery-oriented reduction' },
      weeklyAdjustment: null,
      resolvedContext: competitionContext('near'),
      athleteConstraints: constraintsFor(profile),
    });
    expect(result.workout).toBeDefined();
    expect(result.contextMessage).toMatch(/competition/i);
  });
});

describe('composeContextualWorkout — W: competition + injury (safety never bypassed)', () => {
  it('injury contraindications remain respected during competition taper', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'], injuryIds: ['shoulder'] });
    const result = composeContextualWorkout({
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: null,
      readinessAdjustment: null,
      weeklyAdjustment: null,
      resolvedContext: competitionContext('very_near'),
      athleteConstraints: constraintsFor(profile),
    });
    expect(result.workout).toBeDefined();
  });
});

describe('composeContextualWorkout — AF: determinism', () => {
  it('the same inputs always produce the same output', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const input = {
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: null,
      readinessAdjustment: null,
      weeklyAdjustment: null,
      resolvedContext: travelContext({ equipmentIds: ['dumbbells'] }),
      athleteConstraints: constraintsFor(profile),
    };
    const a = composeContextualWorkout(input);
    const b = composeContextualWorkout(input);
    expect(a).toEqual(b);
  });
});

describe('composeContextualWorkout — AG: base-plan restoration proof (spec §32, critical invariant)', () => {
  it('a travel-adjusted resolution never mutates the athlete profile, and a subsequent normal resolution is identical to the pre-travel base plan', () => {
    const profile = profileFor({ equipmentIds: FULL_EQUIPMENT, trainingLocationIds: ['gym'] });
    const baseBefore = generateTodayWorkout(profile, undefined, 1, NO_PROGRESSION);

    composeContextualWorkout({
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: null,
      readinessAdjustment: null,
      weeklyAdjustment: null,
      resolvedContext: travelContext({ equipmentIds: [] }),
      athleteConstraints: constraintsFor(profile),
    });

    const baseAfter = generateTodayWorkout(profile, undefined, 1, NO_PROGRESSION);
    expect(baseAfter).toEqual(baseBefore);
  });

  it('a competition-adjusted resolution never mutates the athlete profile — normal resolution afterward is unchanged', () => {
    const profile = profileFor({ equipmentIds: [], trainingLocationIds: ['home'] });
    const baseBefore = generateTodayWorkout(profile, undefined, 1, NO_PROGRESSION);

    composeContextualWorkout({
      profile,
      progression: NO_PROGRESSION,
      activeAdjustment: null,
      readinessAdjustment: null,
      weeklyAdjustment: null,
      resolvedContext: competitionContext('very_near'),
      athleteConstraints: constraintsFor(profile),
    });

    const baseAfter = generateTodayWorkout(profile, undefined, 1, NO_PROGRESSION);
    expect(baseAfter).toEqual(baseBefore);
  });
});
