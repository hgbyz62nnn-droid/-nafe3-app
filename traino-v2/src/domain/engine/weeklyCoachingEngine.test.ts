import { describe, expect, it } from 'vitest';
import { buildWeeklyCoachingReview } from './weeklyCoachingEngine';
import { baseAnswers } from './testFixtures';
import type { DayLog } from '../state/LogContext';
import type { UserProfile } from './types';
import type { WeeklyCoachingRecord } from '../coaching/types';

function log(date: string, overrides: Partial<DayLog> = {}): DayLog {
  return { date, loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false, ...overrides };
}

function profileFor(overrides: Partial<UserProfile['answers']> = {}): UserProfile {
  return {
    answers: baseAnswers(overrides),
    level: 'intermediate',
    nutrition: { calories: 2400, proteinG: 140, carbsG: 260, fatG: 70 },
  };
}

describe('buildWeeklyCoachingReview — integration of barrier + rules layers', () => {
  it('A: an athlete with no logs at all gets an honest insufficient-data review', () => {
    const { summary, decision } = buildWeeklyCoachingReview([], [], 3, null, profileFor(), []);
    expect(summary.hasData).toBe(false);
    expect(decision.recommendedAction).toBe('NO_ACTION_NEEDED');
    expect(decision.requiresApproval).toBe(false);
  });

  it('B: a fully-consistent week produces a positive report and no plan change', () => {
    const logs = Array.from({ length: 7 }, (_, i) => log(`2026-01-0${i + 1}`, { workoutCompleted: i < 4 }));
    const { decision } = buildWeeklyCoachingReview(logs, [], 4, null, profileFor(), []);
    expect(decision.barrier).toBeNull();
    expect(decision.recommendedAction).toBe('NO_ACTION_NEEDED');
    expect(decision.requiresApproval).toBe(false);
  });

  it('C: a struggling week with an explicit barrier produces a full, approvable recommendation', () => {
    const logs = [
      log('2026-01-01', { workoutCompleted: true }),
      ...Array.from({ length: 6 }, (_, i) => log(`2026-01-0${i + 2}`)),
    ];
    const checkIn = { barrierIds: ['time' as const], submittedAt: '2026-01-07' };
    const { decision } = buildWeeklyCoachingReview(logs, [], 5, checkIn, profileFor({ sport: 'football' }), []);
    expect(decision.barrier).toBe('time');
    expect(decision.requiresApproval).toBe(true);
    expect(decision.proposedChanges).not.toBeNull();
  });

  it('is generic across sports — the exact same call shape works for football and swimming (architecture rule §15)', () => {
    const logs = [log('2026-01-01'), log('2026-01-02'), log('2026-01-03')];
    const checkIn = { barrierIds: ['lack_of_equipment' as const], submittedAt: '2026-01-07' };
    const football = buildWeeklyCoachingReview(logs, [], 4, checkIn, profileFor({ sport: 'football' }), []);
    const swimming = buildWeeklyCoachingReview(logs, [], 4, checkIn, profileFor({ sport: 'swimming' }), []);
    expect(football.decision.recommendedAction).toBe('SWAP_TO_EQUIPMENT_FREE');
    expect(swimming.decision.recommendedAction).toBe('SWAP_TO_EQUIPMENT_FREE');
  });

  it('D: a barrier repeated across the review history is flagged as recurring', () => {
    const timeDecision = (week: number): WeeklyCoachingRecord => ({
      reviewedPlanWeek: week,
      appliesFromPlanWeek: week + 1,
      weekStartDateKey: `2026-01-0${week}`,
      checkIn: null,
      decision: {
        barrier: 'time',
        severity: 'medium',
        evidence: 'test',
        confidence: 'high',
        recommendedAction: 'REDUCE_SESSION_DURATION',
        affectedPlanArea: 'training',
        proposedChanges: null,
        reason: 'test',
        requiresApproval: true,
        isRecurring: false,
        recurringWeeks: 0,
      },
      approvalStatus: 'approved',
      decidedAt: '2026-01-08',
    });
    const history = [timeDecision(1), timeDecision(2)];
    const logs = [log('2026-01-01'), log('2026-01-02'), log('2026-01-03')];
    const checkIn = { barrierIds: ['time' as const], submittedAt: '2026-01-21' };
    const { decision } = buildWeeklyCoachingReview(logs, [], 5, checkIn, profileFor(), history);
    expect(decision.isRecurring).toBe(true);
    expect(decision.recurringWeeks).toBe(3);
  });
});
