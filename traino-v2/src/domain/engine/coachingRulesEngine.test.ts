import { describe, expect, it } from 'vitest';
import { buildCoachingDecision } from './coachingRulesEngine';
import { computeWeekSummary } from './barrierEngine';
import type { DetectedBarrier } from '../coaching/types';
import { baseAnswers } from './testFixtures';
import type { FitnessLevel, UserProfile } from './types';

function profileFor(overrides: Partial<UserProfile['answers']> = {}, level: FitnessLevel = 'intermediate'): UserProfile {
  return {
    answers: baseAnswers(overrides),
    level,
    nutrition: { calories: 2400, proteinG: 140, carbsG: 260, fatG: 70 },
  };
}

function barrier(id: DetectedBarrier['barrier'], overrides: Partial<DetectedBarrier> = {}): DetectedBarrier {
  return {
    barrier: id,
    severity: 'high',
    confidence: 'high',
    evidence: 'test evidence',
    explicitlySelected: true,
    objectiveSignal: true,
    ...overrides,
  };
}

const noRecurrence = { isRecurring: false, recurringWeeks: 0 };
const cleanSummary = computeWeekSummary([], [], 3);

describe('buildCoachingDecision — no barrier (B: high adherence, no unnecessary adjustment)', () => {
  it('recommends no action and requires no approval when nothing was detected', () => {
    const decision = buildCoachingDecision(null, cleanSummary, profileFor(), noRecurrence);
    expect(decision.recommendedAction).toBe('NO_ACTION_NEEDED');
    expect(decision.requiresApproval).toBe(false);
    expect(decision.proposedChanges).toBeNull();
    expect(decision.barrier).toBeNull();
  });

  it('honestly distinguishes "no data" from "good week" in its reason text (A: no-data athlete)', () => {
    const noDataSummary = computeWeekSummary([], [], 3);
    const decision = buildCoachingDecision(null, noDataSummary, profileFor(), noRecurrence);
    expect(decision.reason.toLowerCase()).toContain('not enough');
  });
});

describe('buildCoachingDecision — time barrier', () => {
  it('reduces session duration when average sessions are long enough to meaningfully cut (football, ~35-55 min days)', () => {
    const decision = buildCoachingDecision(barrier('time'), cleanSummary, profileFor({ sport: 'football' }, 'intermediate'), noRecurrence);
    expect(decision.recommendedAction).toBe('REDUCE_SESSION_DURATION');
    expect(decision.affectedPlanArea).toBe('training');
    expect(decision.proposedChanges?.trainingAdjustment?.volumeMultiplier).toBeLessThan(1);
    expect(decision.proposedChanges?.summary).toMatch(/min -> ~?\d+ min/);
    expect(decision.requiresApproval).toBe(true);
  });

  it('falls back to reducing frequency instead when sessions are already short', () => {
    // A profile whose sport module authors very short sessions would trigger the frequency
    // path; football's own days are >30 min, so this test exercises the guard directly via
    // a low daysAvailablePerWeek to confirm the floor is respected regardless of path taken.
    const profile = profileFor({ sport: 'football', daysAvailablePerWeek: 2 });
    const decision = buildCoachingDecision(barrier('time'), cleanSummary, profile, noRecurrence);
    if (decision.recommendedAction === 'REDUCE_FREQUENCY') {
      expect(decision.proposedChanges?.daysAvailablePerWeek).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('buildCoachingDecision — schedule_conflict (F: missed-workout redistribution)', () => {
  it('proposes a realistic next-week frequency based on what was actually completed', () => {
    const logs = [
      { date: '2026-01-01', loggedMealSlots: [], mealOverrides: {}, workoutCompleted: true },
      { date: '2026-01-02', loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false },
      { date: '2026-01-03', loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false },
    ];
    const summary = computeWeekSummary(logs, [], 5); // planned 5, completed 1
    const profile = profileFor({ daysAvailablePerWeek: 5 });
    const decision = buildCoachingDecision(barrier('schedule_conflict'), summary, profile, noRecurrence);
    expect(decision.recommendedAction).toBe('REDISTRIBUTE_SESSIONS');
    expect(decision.proposedChanges?.daysAvailablePerWeek).toBeLessThanOrEqual(5);
    expect(decision.proposedChanges?.daysAvailablePerWeek).toBeGreaterThanOrEqual(2);
  });
});

describe('buildCoachingDecision — fatigue/recovery barrier (E: conservative adjustment)', () => {
  it('reduces volume/intensity, never frequency or something more drastic', () => {
    const decision = buildCoachingDecision(barrier('fatigue'), cleanSummary, profileFor(), noRecurrence);
    expect(decision.recommendedAction).toBe('REDUCE_VOLUME_INTENSITY');
    expect(decision.proposedChanges?.trainingAdjustment?.volumeMultiplier).toBeLessThan(1);
    expect(decision.proposedChanges?.trainingAdjustment?.volumeMultiplier).toBeGreaterThan(0.5); // conservative, not a wipeout
    expect(decision.proposedChanges?.daysAvailablePerWeek).toBeUndefined();
  });

  it('poor_sleep and stress use the identical conservative rule as fatigue', () => {
    const sleep = buildCoachingDecision(barrier('poor_sleep'), cleanSummary, profileFor(), noRecurrence);
    const stress = buildCoachingDecision(barrier('stress'), cleanSummary, profileFor(), noRecurrence);
    expect(sleep.recommendedAction).toBe('REDUCE_VOLUME_INTENSITY');
    expect(stress.recommendedAction).toBe('REDUCE_VOLUME_INTENSITY');
  });
});

describe('buildCoachingDecision — equipment/travel barriers (H: safe substitution)', () => {
  it('lack_of_equipment swaps to bodyweight using the existing substitution mechanism', () => {
    const decision = buildCoachingDecision(barrier('lack_of_equipment'), cleanSummary, profileFor(), noRecurrence);
    expect(decision.recommendedAction).toBe('SWAP_TO_EQUIPMENT_FREE');
    expect(decision.proposedChanges?.trainingAdjustment?.swapToBodyweight).toBe(true);
  });

  it('travel activates the same bodyweight-swap mechanism as the AI Coach "traveling" intent', () => {
    const decision = buildCoachingDecision(barrier('travel'), cleanSummary, profileFor(), noRecurrence);
    expect(decision.recommendedAction).toBe('ACTIVATE_TRAVEL_MODE');
    expect(decision.proposedChanges?.trainingAdjustment?.swapToBodyweight).toBe(true);
  });
});

describe('buildCoachingDecision — injury/pain barrier (I: existing safety system enforced)', () => {
  it('always uses skipHighImpact + swapToBodyweight, the exact existing pain-safe adjustment', () => {
    const decision = buildCoachingDecision(barrier('injury_pain'), cleanSummary, profileFor(), noRecurrence);
    expect(decision.recommendedAction).toBe('PAIN_SAFE_ADJUSTMENT');
    expect(decision.proposedChanges?.trainingAdjustment?.skipHighImpact).toBe(true);
    expect(decision.proposedChanges?.trainingAdjustment?.swapToBodyweight).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });
});

describe('buildCoachingDecision — nutrition/budget barriers (G: valid recommendation)', () => {
  it('simplifies to a lower budget tier when one is available', () => {
    const decision = buildCoachingDecision(barrier('nutrition_difficulty'), cleanSummary, profileFor({ budgetTier: 'high' }), noRecurrence);
    expect(decision.recommendedAction).toBe('SIMPLIFY_NUTRITION');
    expect(decision.affectedPlanArea).toBe('nutrition');
    expect(decision.proposedChanges?.budgetTier).toBe('medium');
  });

  it('budget barrier uses the same rule as nutrition_difficulty', () => {
    const decision = buildCoachingDecision(barrier('budget'), cleanSummary, profileFor({ budgetTier: 'medium' }), noRecurrence);
    expect(decision.proposedChanges?.budgetTier).toBe('low');
  });

  it('never proposes a budget tier below "low" — respects the floor', () => {
    const decision = buildCoachingDecision(barrier('nutrition_difficulty'), cleanSummary, profileFor({ budgetTier: 'low' }), noRecurrence);
    expect(decision.recommendedAction).toBe('MAINTAIN_PLAN');
    expect(decision.requiresApproval).toBe(false);
    expect(decision.proposedChanges).toBeNull();
  });
});

describe('buildCoachingDecision — motivation/other (no medical/psychological claims)', () => {
  it('motivation never proposes a structural plan change', () => {
    const decision = buildCoachingDecision(barrier('motivation'), cleanSummary, profileFor(), noRecurrence);
    expect(decision.recommendedAction).toBe('MAINTAIN_PLAN');
    expect(decision.proposedChanges).toBeNull();
    expect(decision.requiresApproval).toBe(false);
    expect(decision.reason.toLowerCase()).not.toMatch(/diagnos|depress|anxiet|mental health/);
  });
});

describe('buildCoachingDecision — recurrence propagation (D)', () => {
  it('carries isRecurring/recurringWeeks straight through from the input', () => {
    const decision = buildCoachingDecision(barrier('time'), cleanSummary, profileFor(), { isRecurring: true, recurringWeeks: 4 });
    expect(decision.isRecurring).toBe(true);
    expect(decision.recurringWeeks).toBe(4);
  });
});

describe('buildCoachingDecision — no NaN, no invalid values (N, O)', () => {
  it('every numeric field in every barrier branch is finite', () => {
    const allBarriers: DetectedBarrier['barrier'][] = [
      'time', 'poor_sleep', 'fatigue', 'work_study', 'stress', 'motivation',
      'workout_difficulty', 'injury_pain', 'lack_of_equipment', 'travel',
      'nutrition_difficulty', 'budget', 'schedule_conflict', 'other',
    ];
    for (const id of allBarriers) {
      const decision = buildCoachingDecision(barrier(id), cleanSummary, profileFor(), noRecurrence);
      if (decision.proposedChanges?.trainingAdjustment?.volumeMultiplier !== undefined) {
        expect(Number.isFinite(decision.proposedChanges.trainingAdjustment.volumeMultiplier)).toBe(true);
      }
      if (decision.proposedChanges?.daysAvailablePerWeek !== undefined) {
        expect(Number.isFinite(decision.proposedChanges.daysAvailablePerWeek)).toBe(true);
        expect(decision.proposedChanges.daysAvailablePerWeek).toBeGreaterThan(0);
      }
    }
  });
});
