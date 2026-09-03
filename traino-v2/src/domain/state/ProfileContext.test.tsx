import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProfileProvider, useProfile } from './ProfileContext';
import { localDateKey } from '../engine/dateUtils';

beforeEach(() => {
  localStorage.clear();
});

describe('ProfileContext — Assessment -> AthleteProfile', () => {
  it('a fresh profile starts uncompleted with no plan start date', () => {
    const { result } = renderHook(() => useProfile(), { wrapper: ProfileProvider });
    expect(result.current.hasCompletedAssessment).toBe(false);
    expect(result.current.planStartDate).toBeNull();
  });

  it('updateAnswers writes assessment answers, and the derived profile reflects them', () => {
    const { result } = renderHook(() => useProfile(), { wrapper: ProfileProvider });
    act(() => {
      result.current.updateAnswers({ firstName: 'Sam', experienceYears: 4, currentTrainingFrequency: 5 });
    });
    expect(result.current.answers.firstName).toBe('Sam');
    expect(result.current.profile.answers.experienceYears).toBe(4);
    expect(result.current.profile.level).toBe('advanced'); // score 2 (experience) + 2 (frequency) = 4
  });

  it('experienceYears and currentTrainingFrequency stay independent through the context', () => {
    // Regression for the assessment-semantics bug: writing one must never move the other.
    const { result } = renderHook(() => useProfile(), { wrapper: ProfileProvider });
    act(() => result.current.updateAnswers({ experienceYears: 6 }));
    act(() => result.current.updateAnswers({ currentTrainingFrequency: 1 }));
    expect(result.current.answers.experienceYears).toBe(6);
    expect(result.current.answers.daysAvailablePerWeek).toBe(0); // untouched, still default
    act(() => result.current.updateAnswers({ daysAvailablePerWeek: 4 }));
    expect(result.current.answers.experienceYears).toBe(6); // unaffected by the frequency write
    expect(result.current.answers.currentTrainingFrequency).toBe(1); // unaffected too
  });

  it('completeAssessment sets planStartDate to today, exactly once', () => {
    const { result } = renderHook(() => useProfile(), { wrapper: ProfileProvider });
    act(() => result.current.completeAssessment());
    const firstStart = result.current.planStartDate;
    expect(firstStart).toBe(localDateKey(new Date()));

    act(() => result.current.updateAnswers({ firstName: 'Changed' }));
    act(() => result.current.completeAssessment());
    expect(result.current.planStartDate).toBe(firstStart); // does not reset on a second completion
  });

  it('persists across a remount (survives a page reload)', () => {
    const first = renderHook(() => useProfile(), { wrapper: ProfileProvider });
    act(() => {
      first.result.current.updateAnswers({ firstName: 'Persisted' });
      first.result.current.completeAssessment();
    });

    const second = renderHook(() => useProfile(), { wrapper: ProfileProvider });
    expect(second.result.current.answers.firstName).toBe('Persisted');
    expect(second.result.current.hasCompletedAssessment).toBe(true);
  });

  it('regression: sanitizes corrupt persisted values before they reach the engine-facing profile', () => {
    localStorage.setItem(
      'traino.profile',
      JSON.stringify({
        dataVersion: 3,
        data: {
          answers: { firstName: 'X', sport: 'football', goal: 'general_fitness', experienceYears: 2, currentTrainingFrequency: 2, daysAvailablePerWeek: 2, trainingLocationIds: [], equipmentIds: [], injuryIds: ['none'], sex: 'male', age: NaN, heightCm: 170, weightKg: 70, dietaryPreference: 'no_restriction', allergyIds: [], budgetTier: 'medium' },
          hasCompletedAssessment: true,
          planStartDate: '2026-01-01',
        },
      })
    );
    const { result } = renderHook(() => useProfile(), { wrapper: ProfileProvider });
    expect(Number.isNaN(result.current.profile.answers.age)).toBe(false);
    expect(Number.isFinite(result.current.profile.nutrition.calories)).toBe(true);
  });
});
