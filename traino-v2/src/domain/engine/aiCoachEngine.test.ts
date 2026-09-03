import { describe, expect, it } from 'vitest';
import { getAiCoachReply, getFallbackReply } from './aiCoachEngine';
import { computeReadiness } from './readinessEngine';
import type { AiCoachIntent } from './types';
import type { WeeklyCoachingRecord } from '../coaching/types';
import type { DailyReadinessInputs, DailyReadinessRecord } from '../readiness/types';

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
];

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

describe('getFallbackReply', () => {
  it('never throws and returns a stable, adjustment-free message for unrecognized free text', () => {
    expect(() => getFallbackReply()).not.toThrow();
    const reply = getFallbackReply();
    expect(reply.adjustment).toBeUndefined();
    expect(reply.message.length).toBeGreaterThan(0);
  });
});
