import { describe, expect, it } from 'vitest';
import { getAiCoachReply, getFallbackReply } from './aiCoachEngine';
import { computeReadiness } from './readinessEngine';
import type { AiCoachIntent } from './types';
import type { WeeklyCoachingRecord } from '../coaching/types';
import type { DailyReadinessInputs, DailyReadinessRecord } from '../readiness/types';
import type { ExerciseProgressionDecision } from '../progression/types';

const ALL_INTENTS: AiCoachIntent[] = [
  'feeling_tired',
  'adjust_todays_workout',
  'have_pain',
  'traveling',
  'replace_exercise',
  'missed_workout',
  'ask_about_nutrition',
  'why_consistency_dropped',
  'whats_next_week_change',
  'why_workout_reduced',
  'how_ready_am_i',
  'should_i_train_today',
  'why_weight_increased',
  'why_no_progression',
  'whats_changed_from_last_week',
  'what_should_i_aim_for',
  'why_this_exercise',
  'what_muscles_does_this_train',
  'easier_version',
  'harder_version',
  'why_limited_alternatives',
];

function progressionDecision(overrides: Partial<ExerciseProgressionDecision> = {}): ExerciseProgressionDecision {
  return {
    exerciseName: 'Back Squat',
    decision: 'PROGRESS',
    model: 'load',
    nextTarget: { sets: 3, reps: 6, loadKg: 72.5 },
    previousTarget: { sets: 3, reps: 8, loadKg: 70 },
    reason: 'Progressed because you completed the target with 3 reps in reserve.',
    exposureCount: 1,
    confidence: 'medium',
    ...overrides,
  };
}

function readinessRecord(overrides: Partial<DailyReadinessInputs> = {}): DailyReadinessRecord {
  const inputs: DailyReadinessInputs = {
    sleepQuality: 3, sleepDurationBucket: 3, energy: 3, stress: 3, soreness: 3, motivation: 3, painFlag: false,
    ...overrides,
  };
  const result = computeReadiness(inputs);
  return {
    date: '2026-02-01',
    inputs: result.factors,
    score: result.score,
    status: result.status,
    recommendation: result.recommendation,
    recommendationApplied: result.recommendation.adjustmentApplied,
    submittedAt: '2026-02-01T08:00:00.000Z',
  };
}

function record(overrides: Partial<WeeklyCoachingRecord> = {}): WeeklyCoachingRecord {
  return {
    reviewedPlanWeek: 2,
    appliesFromPlanWeek: 3,
    weekStartDateKey: '2026-01-12',
    checkIn: { barrierIds: ['time'], submittedAt: '2026-01-18' },
    decision: {
      barrier: 'time',
      severity: 'high',
      evidence: '3 of 5 planned sessions missed',
      confidence: 'high',
      recommendedAction: 'REDUCE_SESSION_DURATION',
      affectedPlanArea: 'training',
      proposedChanges: { trainingAdjustment: { volumeMultiplier: 0.65, note: 'test' }, summary: '~50 min -> ~33 min' },
      reason: 'Session length was inconsistent with reported time availability.',
      requiresApproval: true,
      isRecurring: false,
      recurringWeeks: 0,
    },
    approvalStatus: 'pending',
    decidedAt: null,
    ...overrides,
  };
}

describe('getAiCoachReply — deterministic coaching actions', () => {
  it('returns a reply for every closed intent, never throwing or falling through', () => {
    for (const intent of ALL_INTENTS) {
      expect(() => getAiCoachReply(intent)).not.toThrow();
      const reply = getAiCoachReply(intent);
      expect(typeof reply.message).toBe('string');
      expect(reply.message.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic — the same intent always returns the same reply', () => {
    const a = getAiCoachReply('feeling_tired');
    const b = getAiCoachReply('feeling_tired');
    expect(a).toEqual(b);
  });

  it('"have_pain" always produces a pain-safe adjustment (skip high-impact + bodyweight)', () => {
    const reply = getAiCoachReply('have_pain');
    expect(reply.adjustment?.skipHighImpact).toBe(true);
    expect(reply.adjustment?.swapToBodyweight).toBe(true);
  });

  it('"feeling_tired" and "adjust_todays_workout" reduce volume rather than skip the session entirely', () => {
    expect(getAiCoachReply('feeling_tired').adjustment?.volumeMultiplier).toBeLessThan(1);
    expect(getAiCoachReply('adjust_todays_workout').adjustment?.volumeMultiplier).toBeLessThan(1);
  });

  it('"missed_workout" and "ask_about_nutrition" carry no plan adjustment (informational only)', () => {
    expect(getAiCoachReply('missed_workout').adjustment).toBeUndefined();
    expect(getAiCoachReply('ask_about_nutrition').adjustment).toBeUndefined();
  });
});

describe('getAiCoachReply — weekly coaching intents, deterministic over structured context', () => {
  it('why_consistency_dropped explains the stored barrier and evidence when a record exists', () => {
    const reply = getAiCoachReply('why_consistency_dropped', { latestRecord: record() });
    expect(reply.message).toContain('time');
    expect(reply.message).toContain('3 of 5 planned sessions missed');
    expect(reply.ctaLabel).toBe('VIEW WEEKLY REPORT');
  });

  it('why_consistency_dropped gives an honest "not enough data" reply with no record', () => {
    const reply = getAiCoachReply('why_consistency_dropped', { latestRecord: null });
    expect(reply.message.toLowerCase()).toContain("don't have");
  });

  it('whats_next_week_change surfaces the exact stored proposedChanges summary', () => {
    const reply = getAiCoachReply('whats_next_week_change', { latestRecord: record() });
    expect(reply.message).toContain('~50 min -> ~33 min');
  });

  it('whats_next_week_change says nothing is planned when there is no proposed change', () => {
    const clean = record({
      decision: {
        barrier: null, severity: 'low', evidence: 'clean week', confidence: 'high',
        recommendedAction: 'NO_ACTION_NEEDED', affectedPlanArea: 'none', proposedChanges: null,
        reason: 'This week met the plan.', requiresApproval: false, isRecurring: false, recurringWeeks: 0,
      },
    });
    const reply = getAiCoachReply('whats_next_week_change', { latestRecord: clean });
    expect(reply.message.toLowerCase()).toContain('no changes');
  });

  it('why_workout_reduced explains the applied change only when the record was actually approved', () => {
    const approved = record({ approvalStatus: 'approved' });
    const reply = getAiCoachReply('why_workout_reduced', { latestRecord: approved });
    expect(reply.message).toContain('time');
    expect(reply.message).toContain('Session length was inconsistent with reported time availability.');
  });

  it('why_workout_reduced does not claim a reduction happened when the recommendation is only pending', () => {
    const pending = record({ approvalStatus: 'pending' });
    const reply = getAiCoachReply('why_workout_reduced', { latestRecord: pending });
    expect(reply.message.toLowerCase()).toContain("hasn't reduced");
  });

  it('all three weekly-coaching intents never throw and never invoke an external API (pure string templating)', () => {
    for (const intent of ['why_consistency_dropped', 'whats_next_week_change', 'why_workout_reduced'] as AiCoachIntent[]) {
      expect(() => getAiCoachReply(intent)).not.toThrow();
      expect(() => getAiCoachReply(intent, { latestRecord: record() })).not.toThrow();
    }
  });
});

describe('getAiCoachReply — Daily Readiness intents (W)', () => {
  it('how_ready_am_i asks the athlete to check in first when no readiness record exists', () => {
    const reply = getAiCoachReply('how_ready_am_i', { latestRecord: null, todayReadiness: null });
    expect(reply.message.toLowerCase()).toContain("haven't checked in");
    expect(reply.ctaLabel).toBe('CHECK IN');
  });

  it('how_ready_am_i reports the real score/status/factors when a record exists', () => {
    const readiness = readinessRecord({ energy: 5, sleepQuality: 5, stress: 1, soreness: 1 });
    const reply = getAiCoachReply('how_ready_am_i', { latestRecord: null, todayReadiness: readiness });
    expect(reply.message).toContain(`${readiness.score}%`);
    expect(reply.message).toContain('energy 5/5');
  });

  it('should_i_train_today tells the athlete to check in first when no record exists', () => {
    const reply = getAiCoachReply('should_i_train_today', { latestRecord: null, todayReadiness: null });
    expect(reply.ctaLabel).toBe('CHECK IN');
  });

  it('should_i_train_today gives a conservative recovery answer on a recovery-status day', () => {
    const readiness = readinessRecord({ energy: 1, sleepQuality: 1, sleepDurationBucket: 1, stress: 5, soreness: 5 });
    expect(readiness.status).toBe('recovery');
    const reply = getAiCoachReply('should_i_train_today', { latestRecord: null, todayReadiness: readiness });
    expect(reply.message.toLowerCase()).toContain('light');
  });

  it('should_i_train_today prioritizes pain safety over the numeric status', () => {
    const readiness = readinessRecord({ energy: 5, sleepQuality: 5, stress: 1, soreness: 1, painFlag: true });
    const reply = getAiCoachReply('should_i_train_today', { latestRecord: null, todayReadiness: readiness });
    expect(reply.message.toLowerCase()).toContain('pain');
    expect(reply.message).not.toMatch(/diagnos/i);
  });

  it('should_i_train_today says yes on a high-readiness day', () => {
    const readiness = readinessRecord({ energy: 5, sleepQuality: 5, stress: 1, soreness: 1 });
    const reply = getAiCoachReply('should_i_train_today', { latestRecord: null, todayReadiness: readiness });
    expect(reply.message.toLowerCase()).toContain('yes');
  });

  it('why_workout_reduced explains a readiness-driven reduction when one was applied today', () => {
    const readiness = readinessRecord({ energy: 1, sleepQuality: 1, sleepDurationBucket: 1, stress: 5, soreness: 5 });
    expect(readiness.recommendationApplied).toBe(true);
    const reply = getAiCoachReply('why_workout_reduced', { latestRecord: null, todayReadiness: readiness });
    expect(reply.message).toContain(readiness.recommendation.message);
  });

  it("why_workout_reduced prefers today's readiness explanation over an approved weekly-coaching record", () => {
    const readiness = readinessRecord({ energy: 1, sleepQuality: 1, sleepDurationBucket: 1, stress: 5, soreness: 5 });
    const approvedWeekly = record({ approvalStatus: 'approved' });
    const reply = getAiCoachReply('why_workout_reduced', { latestRecord: approvedWeekly, todayReadiness: readiness });
    expect(reply.message).toContain(readiness.recommendation.message);
    expect(reply.message).not.toContain('Session length was inconsistent');
  });

  it('both readiness intents never throw and are deterministic', () => {
    const readiness = readinessRecord();
    for (const intent of ['how_ready_am_i', 'should_i_train_today'] as AiCoachIntent[]) {
      expect(() => getAiCoachReply(intent, { latestRecord: null, todayReadiness: readiness })).not.toThrow();
      const a = getAiCoachReply(intent, { latestRecord: null, todayReadiness: readiness });
      const b = getAiCoachReply(intent, { latestRecord: null, todayReadiness: readiness });
      expect(a).toEqual(b);
    }
  });
});

describe('getAiCoachReply — Progression Engine intents (X)', () => {
  it('why_weight_increased explains the real load bump when one exists', () => {
    const reply = getAiCoachReply('why_weight_increased', {
      latestRecord: null,
      todaysProgressionDecisions: [progressionDecision()],
    });
    expect(reply.message).toContain('reserve');
    expect(reply.message).toContain('72.5kg');
  });

  it('why_weight_increased gives an honest answer when no load actually increased', () => {
    const reply = getAiCoachReply('why_weight_increased', {
      latestRecord: null,
      todaysProgressionDecisions: [progressionDecision({ decision: 'MAINTAIN', nextTarget: { sets: 3, reps: 8, loadKg: 70 } })],
    });
    expect(reply.message.toLowerCase()).toContain("hasn't increased");
  });

  it("why_no_progression explains a HOLD/MAINTAIN/REGRESS reason when one exists", () => {
    const held = progressionDecision({ decision: 'HOLD', reason: 'Held because your last session for this exercise was missed.' });
    const reply = getAiCoachReply('why_no_progression', { latestRecord: null, todaysProgressionDecisions: [held] });
    expect(reply.message).toBe(held.reason);
  });

  it('why_no_progression is honest when everything actually progressed', () => {
    const reply = getAiCoachReply('why_no_progression', { latestRecord: null, todaysProgressionDecisions: [progressionDecision()] });
    expect(reply.message.toLowerCase()).toContain('progressing well');
  });

  it('why_no_progression is honest when there is no history at all', () => {
    const reply = getAiCoachReply('why_no_progression', { latestRecord: null, todaysProgressionDecisions: [] });
    expect(reply.message.toLowerCase()).toContain("don't have enough");
  });

  it('whats_changed_from_last_week describes the previous -> next target transition', () => {
    const reply = getAiCoachReply('whats_changed_from_last_week', {
      latestRecord: null,
      todaysProgressionDecisions: [progressionDecision()],
    });
    expect(reply.message).toContain('70kg');
    expect(reply.message).toContain('72.5kg');
    expect(reply.message).toContain('->');
  });

  it('what_should_i_aim_for states the next target', () => {
    const reply = getAiCoachReply('what_should_i_aim_for', {
      latestRecord: null,
      todaysProgressionDecisions: [progressionDecision()],
    });
    expect(reply.message).toContain('Back Squat');
    expect(reply.message).toContain('72.5kg');
  });

  it('all four progression intents never throw with no context or empty decisions', () => {
    for (const intent of ['why_weight_increased', 'why_no_progression', 'whats_changed_from_last_week', 'what_should_i_aim_for'] as AiCoachIntent[]) {
      expect(() => getAiCoachReply(intent)).not.toThrow();
      expect(() => getAiCoachReply(intent, { latestRecord: null, todaysProgressionDecisions: [] })).not.toThrow();
    }
  });

  it('are deterministic — identical decisions always produce identical replies', () => {
    const decisions = [progressionDecision()];
    const a = getAiCoachReply('whats_changed_from_last_week', { latestRecord: null, todaysProgressionDecisions: decisions });
    const b = getAiCoachReply('whats_changed_from_last_week', { latestRecord: null, todaysProgressionDecisions: decisions });
    expect(a).toEqual(b);
  });
});

describe('getAiCoachReply — Exercise Intelligence intents (Y)', () => {
  const constraints = { availableEquipment: ['barbell', 'squat_rack', 'bench'], injuryIds: ['none'] };

  it('why_this_exercise explains the focused exercise from real ExerciseDefinition data', () => {
    const reply = getAiCoachReply('why_this_exercise', { latestRecord: null, focusedExerciseName: 'Back Squat' });
    expect(reply.message).toContain('Back Squat');
    expect(reply.message).toContain('Squat');
  });

  it('why_this_exercise is honest when no exercise is in focus and no fallback exists', () => {
    const reply = getAiCoachReply('why_this_exercise', { latestRecord: null });
    expect(reply.message).toMatch(/don't have a specific exercise/i);
  });

  it('what_muscles_does_this_train lists real primary/secondary muscles', () => {
    const reply = getAiCoachReply('what_muscles_does_this_train', { latestRecord: null, focusedExerciseName: 'Back Squat' });
    expect(reply.message).toContain('Quads');
    expect(reply.message).toContain('Glutes');
  });

  it('easier_version names the curated regression when one exists', () => {
    const reply = getAiCoachReply('easier_version', { latestRecord: null, focusedExerciseName: 'Back Squat' });
    expect(reply.message).toContain('Goblet Squat');
  });

  it('easier_version is honest when no regression is authored', () => {
    const reply = getAiCoachReply('easier_version', { latestRecord: null, focusedExerciseName: 'Goblet Squat' });
    expect(reply.message).toMatch(/no simpler pre-defined version/i);
  });

  it('harder_version names the curated progression when one exists', () => {
    const reply = getAiCoachReply('harder_version', { latestRecord: null, focusedExerciseName: 'Push-Ups' });
    expect(reply.message).toContain('Feet-Elevated Push-Up');
  });

  it('harder_version is honest when no progression is authored', () => {
    const reply = getAiCoachReply('harder_version', { latestRecord: null, focusedExerciseName: 'Back Squat' });
    expect(reply.message).toMatch(/no harder pre-defined progression/i);
  });

  it('why_limited_alternatives explains real equipment/injury constraints when they apply', () => {
    const reply = getAiCoachReply('why_limited_alternatives', {
      latestRecord: null,
      focusedExerciseName: 'Back Squat',
      athleteConstraints: { availableEquipment: [], injuryIds: ['knee'] },
    });
    expect(reply.message).toContain('equipment');
    expect(reply.message).toMatch(/knee/i);
  });

  it('why_limited_alternatives is honest when nothing is actually restricted', () => {
    const reply = getAiCoachReply('why_limited_alternatives', {
      latestRecord: null,
      focusedExerciseName: 'Back Squat',
      athleteConstraints: constraints,
    });
    expect(reply.message).toMatch(/nothing is being held back/i);
  });

  it('replace_exercise recommends a real, ranked alternative when a focused exercise + constraints are given', () => {
    const reply = getAiCoachReply('replace_exercise', {
      latestRecord: null,
      focusedExerciseName: 'Back Squat',
      athleteConstraints: constraints,
    });
    expect(reply.message).toContain('Back Squat');
    expect(reply.ctaLabel).toBe('CHOOSE EXERCISE');
  });

  it('replace_exercise falls back to the generic dead-end message with no focus/constraints', () => {
    const reply = getAiCoachReply('replace_exercise', { latestRecord: null });
    expect(reply.message).toMatch(/tell me which exercise/i);
  });

  it('replace_exercise never recommends an unsafe exercise even when constraints report an injury', () => {
    const reply = getAiCoachReply('replace_exercise', {
      latestRecord: null,
      focusedExerciseName: 'Back Squat',
      athleteConstraints: { availableEquipment: ['barbell', 'squat_rack'], injuryIds: ['knee'] },
    });
    expect(reply.message).not.toContain('undefined');
  });

  it('all five exercise-intelligence intents never throw and are deterministic', () => {
    const context = { latestRecord: null, focusedExerciseName: 'Back Squat', athleteConstraints: constraints };
    const intents: AiCoachIntent[] = [
      'why_this_exercise',
      'what_muscles_does_this_train',
      'easier_version',
      'harder_version',
      'why_limited_alternatives',
      'replace_exercise',
    ];
    for (const intent of intents) {
      expect(() => getAiCoachReply(intent, context)).not.toThrow();
      expect(getAiCoachReply(intent, context)).toEqual(getAiCoachReply(intent, context));
    }
  });
});

describe('getFallbackReply', () => {
  it('never throws and returns a stable, adjustment-free message for unrecognized free text', () => {
    expect(() => getFallbackReply()).not.toThrow();
    const reply = getFallbackReply();
    expect(reply.adjustment).toBeUndefined();
    expect(reply.message.length).toBeGreaterThan(0);
  });
});
