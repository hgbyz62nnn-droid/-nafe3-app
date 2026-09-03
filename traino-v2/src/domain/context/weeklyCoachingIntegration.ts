import { resolveActiveContext } from './resolveActiveContext';
import type { CompetitionEvent, TravelContext } from './types';

/**
 * Weekly Coaching + Travel/Competition integration (spec §21) — reuses the
 * existing `computeWeekSummary`/`buildWeeklyCoachingReview` orchestrator
 * completely unchanged; this module only adjusts the ONE input that needs
 * adjusting (`plannedPerWeek`) and derives a display-only narrative note,
 * so a travel/competition-adjusted week is never misread as normal missed
 * workouts or penalized adherence.
 */

/**
 * The athlete's normal `daysAvailablePerWeek` is a single weekly rate, not
 * specific calendar days, so there is no existing concept of "which exact
 * days were supposed to be training days" to subtract from directly. This
 * computes a fair, deterministic approximation instead: each of the week's
 * 7 calendar days contributes its OWN expected daily rate (the athlete's
 * normal rate, or Travel Mode's reduced `daysAvailablePerWeek` override for
 * days under an active travel context), and a competition event day
 * contributes nothing at all (spec §11: no normal hard session is expected
 * that day, so it can never look like a missed one).
 */
export function computeContextAdjustedPlannedSessions(
  basePlannedPerWeek: number,
  weekDates: string[],
  travelContexts: TravelContext[],
  competitionEvents: CompetitionEvent[]
): number {
  let totalDailyRate = 0;
  for (const date of weekDates) {
    const resolved = resolveActiveContext(date, travelContexts, competitionEvents);
    if (resolved.competitionPhase === 'event_day') continue;
    const travelOverride = resolved.mode === 'travel' ? resolved.travel?.constraints.daysAvailablePerWeek : undefined;
    totalDailyRate += (travelOverride ?? basePlannedPerWeek) / 7;
  }
  return Math.max(0, Math.round(totalDailyRate));
}

/** A short, honest, non-causal note about how Travel/Competition Mode
 * affected this reviewed week, for display alongside the existing
 * `readinessNote` (spec §21) — null when neither was active that week. */
export function describeWeekContextInfluence(weekDates: string[], travelContexts: TravelContext[], competitionEvents: CompetitionEvent[]): string | null {
  const resolved = weekDates.map((date) => resolveActiveContext(date, travelContexts, competitionEvents));

  const travelDays = resolved.filter((r) => r.mode === 'travel').length;
  const hadEventDay = resolved.some((r) => r.competitionPhase === 'event_day');
  const hadPostEvent = resolved.some((r) => r.competitionPhase === 'post_event');
  const hadTaper = resolved.some((r) => r.competitionPhase === 'near' || r.competitionPhase === 'very_near');

  if (travelDays > 0) {
    return `You were in Travel Mode for ${travelDays} day${travelDays === 1 ? '' : 's'} this week — sessions were adjusted for your available equipment and time rather than counted as missed.`;
  }
  if (hadEventDay) {
    return "This week included a competition — today's normal session expectation doesn't apply on event day.";
  }
  if (hadPostEvent) {
    return 'Your plan included a recovery-oriented adjustment after a recent competition this week.';
  }
  if (hadTaper) {
    return 'Your plan was temporarily reduced this week to prepare for an upcoming competition.';
  }
  return null;
}
