import type { UserProfile } from './types';
import type { DayLog } from '../state/LogContext';
import type { CoachingDecision, WeekSummary, WeeklyCheckIn, WeeklyCoachingRecord } from '../coaching/types';
import { computeWeekSummary, detectBarriers, detectRecurringPattern, pickPrimaryBarrier } from './barrierEngine';
import { buildCoachingDecision } from './coachingRulesEngine';

/**
 * Top-level orchestrator for the Weekly Coaching Loop — the one function
 * screens and the AI Coach call. It composes the barrier-analysis layer
 * and the coaching-rule layer over real logged data; it does not compute
 * anything itself that those layers (or the pre-existing progress/
 * nutrition/plan engines they're built on) don't already compute.
 *
 * Nothing here reads `profile.answers.sport` for branching — every input
 * is generic athlete/log/plan data, so Football and Swimming (and any
 * future sport) go through the exact same review.
 */

export interface WeeklyCoachingReview {
  summary: WeekSummary;
  decision: CoachingDecision;
}

export function buildWeeklyCoachingReview(
  currentWeekLogs: DayLog[],
  priorWeekLogs: DayLog[],
  plannedPerWeek: number,
  checkIn: WeeklyCheckIn | null,
  profile: UserProfile,
  history: WeeklyCoachingRecord[]
): WeeklyCoachingReview {
  const summary = computeWeekSummary(currentWeekLogs, priorWeekLogs, plannedPerWeek);
  const detected = detectBarriers(checkIn, summary);
  const primary = pickPrimaryBarrier(detected);
  const recurring = detectRecurringPattern(history, primary?.barrier ?? null);
  const decision = buildCoachingDecision(primary, summary, profile, recurring);
  return { summary, decision };
}
