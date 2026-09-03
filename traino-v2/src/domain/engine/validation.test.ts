import { describe, expect, it } from 'vitest';
import { isValidWeekNumber, isValidWeightKg, sanitizeAssessmentAnswers, sanitizeReadinessInputs } from './validation';
import { baseAnswers } from './testFixtures';
import type { DailyReadinessInputs } from '../readiness/types';

function baseReadinessInputs(): DailyReadinessInputs {
  return { sleepQuality: 3, sleepDurationBucket: 3, energy: 3, stress: 3, soreness: 3, motivation: 3, painFlag: false };
}

describe('sanitizeAssessmentAnswers', () => {
  it('passes already-clean answers through unchanged', () => {
    const answers = baseAnswers();
    const { value, violations } = sanitizeAssessmentAnswers(answers);
    expect(value).toEqual(answers);
    expect(violations).toEqual([]);
  });

  it('regression: clamps a NaN age/height/weight instead of letting it reach the nutrition formula', () => {
    const corrupted = { ...baseAnswers(), age: NaN, heightCm: NaN, weightKg: NaN };
    const { value, violations } = sanitizeAssessmentAnswers(corrupted);
    expect(Number.isNaN(value.age)).toBe(false);
    expect(Number.isNaN(value.heightCm)).toBe(false);
    expect(Number.isNaN(value.weightKg)).toBe(false);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('clamps impossible ranges (negative age, absurd height) to safe bounds', () => {
    const { value } = sanitizeAssessmentAnswers({ ...baseAnswers(), age: -10, heightCm: 900, weightKg: -5 });
    expect(value.age).toBeGreaterThanOrEqual(5);
    expect(value.heightCm).toBeLessThanOrEqual(250);
    expect(value.weightKg).toBeGreaterThanOrEqual(20);
  });

  it('replaces an invalid enum value (sport/goal/sex/diet/budget) with a safe default', () => {
    const corrupted = {
      ...baseAnswers(),
      sport: 'not_a_sport' as never,
      goal: 'not_a_goal' as never,
      sex: 'not_a_sex' as never,
      dietaryPreference: 'not_a_diet' as never,
      budgetTier: 'not_a_tier' as never,
    };
    const { value, violations } = sanitizeAssessmentAnswers(corrupted);
    expect(['football', 'basketball', 'swimming', 'boxing', 'tennis', 'running', 'gym_fitness', 'volleyball', 'athletics', 'martial_arts']).toContain(value.sport);
    expect(['performance', 'fat_loss', 'muscle_gain', 'general_fitness', 'recovery']).toContain(value.goal);
    expect(['male', 'female']).toContain(value.sex);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('normalizes a missing/empty injuryIds array to the "none" sentinel rather than leaving it ambiguous', () => {
    const { value } = sanitizeAssessmentAnswers({ ...baseAnswers(), injuryIds: [] });
    expect(value.injuryIds).toEqual(['none']);
  });

  it('resets a malformed array field (not-an-array) to an empty array instead of throwing downstream', () => {
    const corrupted = { ...baseAnswers(), equipmentIds: 'not-an-array' as never };
    expect(() => sanitizeAssessmentAnswers(corrupted)).not.toThrow();
    const { value } = sanitizeAssessmentAnswers(corrupted);
    expect(value.equipmentIds).toEqual([]);
  });
});

describe('isValidWeightKg', () => {
  it('accepts plausible bodyweights', () => {
    expect(isValidWeightKg(72)).toBe(true);
    expect(isValidWeightKg(45)).toBe(true);
  });

  it('regression: rejects NaN, zero, negative, and absurd values', () => {
    expect(isValidWeightKg(NaN)).toBe(false);
    expect(isValidWeightKg(0)).toBe(false);
    expect(isValidWeightKg(-70)).toBe(false);
    expect(isValidWeightKg(5000)).toBe(false);
    expect(isValidWeightKg(Infinity)).toBe(false);
  });
});

describe('isValidWeekNumber', () => {
  it('accepts non-negative integers', () => {
    expect(isValidWeekNumber(1)).toBe(true);
    expect(isValidWeekNumber(0)).toBe(true);
    expect(isValidWeekNumber(52)).toBe(true);
  });

  it('regression: rejects NaN, negative, and non-integer values', () => {
    expect(isValidWeekNumber(NaN)).toBe(false);
    expect(isValidWeekNumber(-1)).toBe(false);
    expect(isValidWeekNumber(2.5)).toBe(false);
    expect(isValidWeekNumber(Infinity)).toBe(false);
  });
});

describe('sanitizeReadinessInputs', () => {
  it('passes already-clean inputs through unchanged', () => {
    const inputs = baseReadinessInputs();
    const { value, violations } = sanitizeReadinessInputs(inputs);
    expect(value).toEqual(inputs);
    expect(violations).toEqual([]);
  });

  it('defaults NaN/missing scale values to 3 rather than propagating NaN', () => {
    const corrupted = { ...baseReadinessInputs(), sleepQuality: NaN as unknown as 1, energy: undefined as unknown as 1 };
    const { value, violations } = sanitizeReadinessInputs(corrupted);
    expect(value.sleepQuality).toBe(3);
    expect(value.energy).toBe(3);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('clamps out-of-range scale values (0, 6, -5, 100) to a safe default', () => {
    const { value } = sanitizeReadinessInputs({ ...baseReadinessInputs(), stress: 0 as 1, soreness: 6 as 1, motivation: -5 as 1 });
    expect(value.stress).toBe(3);
    expect(value.soreness).toBe(3);
    expect(value.motivation).toBe(3);
  });

  it('rejects an invalid enum-like value for a scale field', () => {
    const { value, violations } = sanitizeReadinessInputs({ ...baseReadinessInputs(), sleepDurationBucket: 'high' as unknown as 1 });
    expect(value.sleepDurationBucket).toBe(3);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('defaults a non-boolean painFlag to false', () => {
    const { value, violations } = sanitizeReadinessInputs({ ...baseReadinessInputs(), painFlag: 'yes' as unknown as boolean });
    expect(value.painFlag).toBe(false);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('never produces NaN for any field regardless of corrupted input', () => {
    const corrupted = {
      sleepQuality: NaN as unknown as 1,
      sleepDurationBucket: undefined as unknown as 1,
      energy: 'x' as unknown as 1,
      stress: null as unknown as 1,
      soreness: Infinity as unknown as 1,
      motivation: -Infinity as unknown as 1,
      painFlag: 1 as unknown as boolean,
    };
    const { value } = sanitizeReadinessInputs(corrupted);
    for (const key of ['sleepQuality', 'sleepDurationBucket', 'energy', 'stress', 'soreness', 'motivation'] as const) {
      expect(Number.isNaN(value[key])).toBe(false);
      expect(value[key]).toBeGreaterThanOrEqual(1);
      expect(value[key]).toBeLessThanOrEqual(5);
    }
  });
});
