import type { AssessmentAnswers } from './types';

/**
 * Shared "clean" assessment answers for tests — every field explicitly set to a
 * plausible value so a test only needs to override what it's actually exercising.
 * Not exported from any production module; test-only fixture.
 */
export function baseAnswers(overrides: Partial<AssessmentAnswers> = {}): AssessmentAnswers {
  return {
    firstName: 'Test Athlete',
    sport: 'football',
    goal: 'general_fitness',
    experienceYears: 2,
    currentTrainingFrequency: 3,
    daysAvailablePerWeek: 3,
    trainingLocationIds: ['home'],
    equipmentIds: [],
    injuryIds: ['none'],
    sex: 'male',
    age: 25,
    heightCm: 178,
    weightKg: 75,
    dietaryPreference: 'no_restriction',
    allergyIds: [],
    budgetTier: 'medium',
    ...overrides,
  };
}
