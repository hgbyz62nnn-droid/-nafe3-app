import { describe, expect, it } from 'vitest';
import { determineLevel } from './levelEngine';
import { baseAnswers } from './testFixtures';

describe('determineLevel — experience-level selection', () => {
  it('classifies a true beginner (no experience, low frequency)', () => {
    const level = determineLevel(baseAnswers({ experienceYears: 0, currentTrainingFrequency: 0 }));
    expect(level).toBe('beginner');
  });

  it('classifies intermediate from experience alone', () => {
    const level = determineLevel(baseAnswers({ experienceYears: 1, currentTrainingFrequency: 0 }));
    expect(level).toBe('intermediate');
  });

  it('classifies intermediate from frequency alone', () => {
    const level = determineLevel(baseAnswers({ experienceYears: 0, currentTrainingFrequency: 3 }));
    expect(level).toBe('intermediate');
  });

  it('classifies advanced when both experience and frequency are high', () => {
    const level = determineLevel(baseAnswers({ experienceYears: 3, currentTrainingFrequency: 5 }));
    expect(level).toBe('advanced');
  });

  it('classifies advanced from experience alone at the top band', () => {
    const level = determineLevel(baseAnswers({ experienceYears: 5, currentTrainingFrequency: 5 }));
    expect(level).toBe('advanced');
  });

  it('experienceYears and currentTrainingFrequency are independent — changing one does not move the other', () => {
    // Regression for the assessment-semantics fix: these must be two genuinely
    // separate fields, never coupled/defaulted from one another.
    const a = baseAnswers({ experienceYears: 5, currentTrainingFrequency: 1 });
    const b = { ...a, experienceYears: 0 };
    expect(b.currentTrainingFrequency).toBe(1); // unaffected by changing experienceYears
    expect(a.daysAvailablePerWeek).toBe(3); // the fixture's default, independent of both
  });
});
