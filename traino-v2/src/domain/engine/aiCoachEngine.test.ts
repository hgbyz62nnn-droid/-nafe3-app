import { describe, expect, it } from 'vitest';
import { getAiCoachReply, getFallbackReply } from './aiCoachEngine';
import type { AiCoachIntent } from './types';

const ALL_INTENTS: AiCoachIntent[] = [
  'feeling_tired',
  'adjust_todays_workout',
  'have_pain',
  'traveling',
  'replace_exercise',
  'missed_workout',
  'ask_about_nutrition',
];

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

describe('getFallbackReply', () => {
  it('never throws and returns a stable, adjustment-free message for unrecognized free text', () => {
    expect(() => getFallbackReply()).not.toThrow();
    const reply = getFallbackReply();
    expect(reply.adjustment).toBeUndefined();
    expect(reply.message.length).toBeGreaterThan(0);
  });
});
