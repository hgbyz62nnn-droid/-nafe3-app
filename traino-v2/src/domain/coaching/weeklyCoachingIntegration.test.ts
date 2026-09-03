import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { ProfileProvider, useProfile } from '../state/ProfileContext';
import { LogProvider, useLogs } from '../state/LogContext';
import { WeeklyCoachingProvider, useWeeklyCoaching } from '../state/WeeklyCoachingContext';
import { computeProgressionInfo } from '../engine/progressionEngine';
import { buildWeeklyCoachingReview } from '../engine/weeklyCoachingEngine';
import { applyCoachAdjustment, generateTodayWorkout } from '../engine/planEngine';
import { localDateKey } from '../engine/dateUtils';

/**
 * End-to-end proof of the approval gate at the level Home.tsx/TodaysWorkout.tsx
 * actually consume it: a rejected recommendation must leave the resolved plan
 * unaffected (J); an approved one must concretely change it via the exact same
 * `applyCoachAdjustment` mechanism the AI Coach chat already uses (K) — and
 * historical logs are never touched either way.
 *
 * `planStartDate` is set by `completeAssessment()` to the real current date (no
 * test hook overrides it), so this test logs against "today" rather than a fixed
 * calendar date, and lets `computeProgressionInfo` use its own real-`Date.now()`
 * default rather than an injected one — both sides of the calendar math agree.
 */

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    ProfileProvider,
    null,
    createElement(LogProvider, null, createElement(WeeklyCoachingProvider, null, children))
  );
}

function useAll() {
  return { profile: useProfile(), logs: useLogs(), coaching: useWeeklyCoaching() };
}

beforeEach(() => {
  localStorage.clear();
});

function setUpStrugglingWeek(result: { current: ReturnType<typeof useAll> }) {
  act(() => {
    result.current.profile.updateAnswers({
      sport: 'football',
      experienceYears: 2,
      currentTrainingFrequency: 5,
      daysAvailablePerWeek: 5,
      trainingLocationIds: ['home'],
      equipmentIds: [],
      injuryIds: ['none'],
    });
    result.current.profile.completeAssessment();
  });

  const today = localDateKey(new Date());
  // Only 1 of 5 planned sessions completed this week — a clear "time" barrier signal.
  act(() => {
    result.current.logs.setWorkoutCompleted(today, true, 'Speed + Lower Body', 'speed');
  });

  const planStartDate = result.current.profile.planStartDate!;
  const progressionLogs = result.current.logs.getLogsSince(planStartDate);
  const { currentPlanWeek, progressionWeek } = computeProgressionInfo(
    planStartDate,
    progressionLogs,
    result.current.profile.profile.answers.daysAvailablePerWeek
  );

  const { decision } = buildWeeklyCoachingReview(
    progressionLogs,
    [],
    result.current.profile.profile.answers.daysAvailablePerWeek,
    { barrierIds: ['time'], submittedAt: today },
    result.current.profile.profile,
    []
  );

  return { today, currentPlanWeek, progressionWeek, decision };
}

describe('Weekly Coaching Loop — approval gate integration', () => {
  it('J: rejecting a recommendation leaves no approved adjustment for next week, and history is untouched', () => {
    const { result } = renderHook(useAll, { wrapper });
    const { today, currentPlanWeek, decision } = setUpStrugglingWeek(result);
    expect(decision.requiresApproval).toBe(true);

    act(() => {
      result.current.coaching.saveReview(currentPlanWeek, today, null, decision);
      result.current.coaching.reject(currentPlanWeek);
    });

    expect(result.current.coaching.getApprovedAdjustmentForWeek(currentPlanWeek + 1)).toBeNull();
    expect(result.current.logs.getDayLog(today).workoutCompleted).toBe(true);
  });

  it('K: approving a recommendation makes an adjustment available that concretely reduces next week\'s plan, and history is untouched', () => {
    const { result } = renderHook(useAll, { wrapper });
    const { today, currentPlanWeek, progressionWeek, decision } = setUpStrugglingWeek(result);

    act(() => {
      result.current.coaching.saveReview(currentPlanWeek, today, null, decision);
      result.current.coaching.approve(currentPlanWeek);
    });

    const approvedRecord = result.current.coaching.getApprovedAdjustmentForWeek(currentPlanWeek + 1);
    expect(approvedRecord).not.toBeNull();
    const trainingAdjustment = approvedRecord!.decision!.proposedChanges!.trainingAdjustment!;
    expect(trainingAdjustment.volumeMultiplier).toBeLessThan(1);

    const baseline = generateTodayWorkout(result.current.profile.profile, 1, progressionWeek);
    const adjusted = applyCoachAdjustment(result.current.profile.profile, 1, trainingAdjustment, progressionWeek);

    const nonTimed = (w: typeof baseline) => w.exercises.filter((e) => e.category !== 'warmup' && e.category !== 'cooldown');
    const baselineSets = nonTimed(baseline).reduce((s, e) => s + e.sets, 0);
    const adjustedSets = nonTimed(adjusted).reduce((s, e) => s + e.sets, 0);
    expect(adjustedSets).toBeLessThan(baselineSets);

    expect(result.current.logs.getDayLog(today).workoutCompleted).toBe(true);
  });
});
