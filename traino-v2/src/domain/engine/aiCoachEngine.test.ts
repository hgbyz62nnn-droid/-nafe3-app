import { describe, expect, it } from 'vitest';
import { getAiCoachReply, getFallbackReply } from './aiCoachEngine';
import type { AiCoachIntent } from './types';
import type { WeeklyCoachingRecord } from '../coaching/types';

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
];

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

describe('getFallbackReply', () => {
  it('never throws and returns a stable, adjustment-free message for unrecognized free text', () => {
    expect(() => getFallbackReply()).not.toThrow();
    const reply = getFallbackReply();
    expect(reply.adjustment).toBeUndefined();
    expect(reply.message.length).toBeGreaterThan(0);
  });
});
