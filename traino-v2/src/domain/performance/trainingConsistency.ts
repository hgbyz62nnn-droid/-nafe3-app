import type { DayLog } from '../state/LogContext';
import type { TravelContext, CompetitionEvent } from '../context/types';
import type { TrainingConsistencySummary } from './types';
import { resolveActiveContext } from '../context/resolveActiveContext';
import { resolveCompetitionDayPlan } from '../context/competitionEngine';
import { computeContextAdjustedPlannedSessions } from '../context/weeklyCoachingIntegration';

/**
 * Training Consistency (spec §8) — real planned/completed/adjusted session
 * counts, context-aware: a Travel or Competition day is never counted as an
 * ordinary missed workout (spec §21), and `plannedSessions` is already
 * context-adjusted (reuses the exact same function Weekly Coaching uses),
 * so this can never disagree with the coaching decision shown alongside it.
 */
export function buildTrainingConsistency(
  weekDayLogs: DayLog[],
  plannedPerWeek: number,
  travelContexts: TravelContext[],
  competitionEvents: CompetitionEvent[]
): TrainingConsistencySummary {
  const weekDates = weekDayLogs.map((d) => d.date);
  const plannedSessions = computeContextAdjustedPlannedSessions(plannedPerWeek, weekDates, travelContexts, competitionEvents);
  const completedSessions = weekDayLogs.filter((d) => d.workoutCompleted).length;

  let travelAdjustedSessions = 0;
  let competitionAdjustedCompletedSessions = 0;
  let intentionallySkippedCompetitionSessions = 0;

  for (const day of weekDayLogs) {
    const resolved = resolveActiveContext(day.date, travelContexts, competitionEvents);
    if (resolved.mode === 'travel' && day.workoutCompleted) {
      travelAdjustedSessions++;
    } else if (resolved.mode === 'competition') {
      const dayPlan = resolveCompetitionDayPlan(resolved.competitionPhase);
      if (dayPlan.skipNormalSession && !day.workoutCompleted) {
        intentionallySkippedCompetitionSessions++;
      } else if (!dayPlan.skipNormalSession && day.workoutCompleted) {
        competitionAdjustedCompletedSessions++;
      }
    }
  }

  const adjustedSessions = travelAdjustedSessions + competitionAdjustedCompletedSessions;
  const hasData = plannedSessions > 0 || completedSessions > 0;
  const completionPct = plannedSessions > 0 ? Math.max(0, Math.round((completedSessions / plannedSessions) * 100)) : 0;

  return {
    hasData,
    plannedSessions,
    completedSessions,
    adjustedSessions,
    travelAdjustedSessions,
    intentionallySkippedCompetitionSessions,
    completionPct,
  };
}
