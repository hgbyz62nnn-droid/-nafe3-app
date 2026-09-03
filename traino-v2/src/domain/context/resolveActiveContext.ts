import { parseLocalDateKey } from '../engine/dateUtils';
import type { CompetitionEvent, CompetitionPhase, ResolvedContext, TravelContext } from './types';

/**
 * Deterministic resolution of "which context applies today" (spec §14/§15).
 * Pure function: same date + same stored contexts -> same result, always.
 *
 * Precedence when a travel context and a competition event would BOTH be
 * active for the same date (creation-time validation, see validation.ts,
 * is what actually prevents this from happening for new data — this
 * resolver stays defensive for any pre-existing/imported data): Competition
 * wins, per the documented SAFETY > COMPETITION > READINESS > TRAVEL >
 * PROGRESSION > BASE precedence (spec §15) — an athlete never accidentally
 * trains through event-day/taper rules just because a travel window
 * happens to overlap.
 */

/** Preparation-phase thresholds, in days before the event (spec §11) — named,
 * documented, deliberately conservative defaults, not universal physiological
 * claims. A CompetitionEvent may override `preparationWindowDays`; these
 * thresholds subdivide whatever window is configured. */
export const COMPETITION_VERY_NEAR_DAYS = 2;
export const COMPETITION_DEFAULT_PREP_DAYS = 10;
export const COMPETITION_DEFAULT_RECOVERY_DAYS = 2;

function daysUntil(fromKey: string, toKey: string): number | null {
  const from = parseLocalDateKey(fromKey);
  const to = parseLocalDateKey(toKey);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** Which named phase `date` falls into relative to one competition event, or
 * 'none' if `date` is outside that event's configured window entirely. */
export function competitionPhaseForEvent(event: CompetitionEvent, date: string): CompetitionPhase {
  const delta = daysUntil(date, event.eventDate); // positive = event is in the future
  if (delta === null) return 'none';

  const prepDays = event.preparationWindowDays ?? COMPETITION_DEFAULT_PREP_DAYS;
  const recoveryDays = event.recoveryWindowDays ?? COMPETITION_DEFAULT_RECOVERY_DAYS;

  if (delta === 0) return 'event_day';
  if (delta < 0) return delta >= -recoveryDays ? 'post_event' : 'none';
  if (delta <= COMPETITION_VERY_NEAR_DAYS) return 'very_near';
  if (delta <= prepDays) return 'near';
  return 'none';
}

function isWithinTravelWindow(travel: TravelContext, date: string): boolean {
  return date >= travel.startDate && date <= travel.endDate;
}

/** Picks the single most relevant competition event for `date` among
 * possibly-many stored events: the one whose window actually covers `date`
 * (per `competitionPhaseForEvent`), breaking ties by nearest event date and
 * then by id — deterministic regardless of storage/insertion order. */
function selectRelevantEvent(events: CompetitionEvent[], date: string): { event: CompetitionEvent; phase: CompetitionPhase } | null {
  const active = events
    .map((event) => ({ event, phase: competitionPhaseForEvent(event, date) }))
    .filter((r): r is { event: CompetitionEvent; phase: CompetitionPhase } => r.phase !== 'none');

  if (active.length === 0) return null;
  active.sort((a, b) => {
    const da = Math.abs(daysUntil(date, a.event.eventDate) ?? Number.MAX_SAFE_INTEGER);
    const db = Math.abs(daysUntil(date, b.event.eventDate) ?? Number.MAX_SAFE_INTEGER);
    if (da !== db) return da - db;
    return a.event.id.localeCompare(b.event.id);
  });
  return active[0];
}

function selectRelevantTravel(travelContexts: TravelContext[], date: string): TravelContext | null {
  const active = travelContexts.filter((t) => isWithinTravelWindow(t, date));
  if (active.length === 0) return null;
  // Deterministic tie-break for (invalid, should-have-been-rejected) overlapping
  // travel windows: the one that started most recently.
  return [...active].sort((a, b) => (a.startDate === b.startDate ? a.id.localeCompare(b.id) : b.startDate.localeCompare(a.startDate)))[0];
}

export function resolveActiveContext(date: string, travelContexts: TravelContext[], competitionEvents: CompetitionEvent[]): ResolvedContext {
  const relevantEvent = selectRelevantEvent(competitionEvents, date);
  const relevantTravel = selectRelevantTravel(travelContexts, date);

  if (relevantEvent) {
    return { mode: 'competition', travel: relevantTravel, competition: relevantEvent.event, competitionPhase: relevantEvent.phase };
  }
  if (relevantTravel) {
    return { mode: 'travel', travel: relevantTravel, competition: null, competitionPhase: 'none' };
  }
  return { mode: 'normal', travel: null, competition: null, competitionPhase: 'none' };
}
