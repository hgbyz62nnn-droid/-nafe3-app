import { describe, expect, it } from 'vitest';
import { isValidWeekNumber, isValidWeightKg, sanitizeAssessmentAnswers } from './validation';
import { baseAnswers } from './testFixtures';

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
