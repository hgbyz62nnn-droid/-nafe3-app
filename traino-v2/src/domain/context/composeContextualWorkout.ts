import { applyCoachAdjustment, generateTodayWorkout, type ResolvedWorkout } from '../engine/planEngine';
import type { AiCoachAdjustment, UserProfile } from '../engine/types';
import type { ExerciseProgressionContext } from '../engine/progressionIntegration';
import type { AthleteConstraints } from '../exercise/matchingEngine';
import { resolveCompetitionDayPlan } from './competitionEngine';
import { resolveTravelWorkout } from './travelEngine';
import type { ResolvedContext } from './types';

/**
 * Context precedence composition (spec §15/§16) — documented final rule,
 * adapted to this app's EXISTING single-winner adjustment chain
 * (TodaysWorkout.tsx already resolves `activeAdjustment ?? readinessAdjustment
 * ?? weeklyAdjustment` this way) rather than inventing a new scoring system:
 *
 *   1. SAFETY — injury contraindication is enforced unconditionally inside
 *      planEngine's resolveExercise for every path below; nothing here can
 *      bypass it.
 *   2. EQUIPMENT/LOCATION — sourced from Travel Mode's override when travel
 *      is active for today, otherwise the athlete's stored profile. This is
 *      an INDEPENDENT axis from the volume/safety adjustment below, which is
 *      exactly what makes "Travel + Low Readiness -> travel constraints +
 *      readiness reduction" (spec §16) fall out naturally: travel's
 *      equipment/location restriction always applies, and whichever
 *      volume/safety adjustment wins step 3 is layered on top of it in the
 *      SAME resolution pass (see travelEngine.ts's `adjustment` option).
 *   3. VOLUME/SAFETY ADJUSTMENT — exactly one source wins, most specific and
 *      time-sensitive first: an explicit AI Coach chat action (`activeAdjustment`)
 *      > today's Competition Mode day-plan (near/very_near/post_event) >
 *      today's readiness recommendation > the standing approved weekly-coaching
 *      adjustment. Never stacked/averaged — same "most specific wins outright"
 *      rule the existing readiness/weekly chain already documented.
 *   4. TIME COMPRESSION — applied last, only when travel is active, against
 *      whatever steps 2-3 already produced.
 *   5. COMPETITION EVENT DAY — short-circuits everything above: no normal
 *      session is generated at all.
 *   6. PROGRESSION — reps/load targets computed within whatever session
 *      shape steps 1-4 resolved (existing, unchanged behavior).
 *   7. BASE PLAN — the untouched foundation every step above modifies a
 *      COPY of; nothing here ever mutates `profile`/the Sport Module program.
 */

export interface ComposeContextualWorkoutInput {
  profile: UserProfile;
  dayIndex?: number;
  weekNumber?: number;
  progression?: ExerciseProgressionContext;
  /** Precedence-chain adjustment sources, already resolved by the caller
   * (existing TodaysWorkout.tsx logic) — highest-precedence first. */
  activeAdjustment: AiCoachAdjustment | null;
  readinessAdjustment: AiCoachAdjustment | null;
  weeklyAdjustment: AiCoachAdjustment | null;
  resolvedContext: ResolvedContext;
  athleteConstraints: AthleteConstraints;
}

export interface ComposedWorkoutResult {
  skipNormalSession: boolean;
  /** Non-null whenever Travel or Competition Mode meaningfully changed today's
   * session, for the "Today's workout adjusted for ___" UI banner (spec §12/§25). */
  contextMessage: string | null;
  workout: ResolvedWorkout | null;
}

export function composeContextualWorkout(input: ComposeContextualWorkoutInput): ComposedWorkoutResult {
  const isCompetitionToday = input.resolvedContext.mode === 'competition' && input.resolvedContext.competition;
  const competitionPlan = isCompetitionToday ? resolveCompetitionDayPlan(input.resolvedContext.competitionPhase) : null;

  if (competitionPlan?.skipNormalSession) {
    return { skipNormalSession: true, contextMessage: competitionPlan.message, workout: null };
  }

  const volumeAdjustment = input.activeAdjustment ?? competitionPlan?.adjustment ?? input.readinessAdjustment ?? input.weeklyAdjustment ?? null;

  const isTravelToday = input.resolvedContext.mode === 'travel' && input.resolvedContext.travel;
  let workout: ResolvedWorkout;
  let contextMessage: string | null = competitionPlan?.message ?? null;

  if (isTravelToday && input.resolvedContext.travel) {
    workout = resolveTravelWorkout(input.profile, input.resolvedContext.travel.constraints, {
      dayIndex: input.dayIndex,
      weekNumber: input.weekNumber,
      progression: input.progression,
      athleteConstraints: input.athleteConstraints,
      adjustment: volumeAdjustment ?? undefined,
    });
    contextMessage = contextMessage ?? "Today's session is adjusted for Travel Mode.";
  } else {
    workout = volumeAdjustment
      ? applyCoachAdjustment(input.profile, input.dayIndex, volumeAdjustment, input.weekNumber ?? 1, input.progression)
      : generateTodayWorkout(input.profile, input.dayIndex, input.weekNumber ?? 1, input.progression);
  }

  return { skipNormalSession: false, contextMessage, workout };
}
