import type { AiCoachAdjustment } from '../engine/types';
import { parseLocalDateKey } from '../engine/dateUtils';
import type { CompetitionEvent, CompetitionPhase } from './types';

/**
 * Competition Mode training behavior (spec §9-§13) — conservative, named,
 * documented rules mapping a competition phase to the SAME `AiCoachAdjustment`
 * shape `applyCoachAdjustment`/`generateContextAdjustedWorkout` already
 * consume (reused, not duplicated). Never prescribes extreme training,
 * calorie restriction, supplements, medication, dehydration, or weight cuts
 * — the only levers here are volume/high-impact, exactly like every other
 * adjustment source in this app (readiness, weekly coaching).
 *
 * These thresholds are a deliberately simple, conservative default — not a
 * claimed universal physiological truth (spec §11) — and are documented here
 * so the exact rule behind any day's adjustment is always traceable.
 */

export interface CompetitionDayPlan {
  phase: CompetitionPhase;
  /** True only on the event day itself — no normal hard training session is
   * produced at all (spec §11: "Event day: no normal hard training session"). */
  skipNormalSession: boolean;
  adjustment: AiCoachAdjustment | null;
  /** User-facing explanation of why today's session changed (spec §12) — always
   * set when `phase` isn't 'none'/'far', so the athlete understands the change. */
  message: string;
}

const NORMAL_DAY_PLAN: CompetitionDayPlan = { phase: 'none', skipNormalSession: false, adjustment: null, message: '' };

export function resolveCompetitionDayPlan(phase: CompetitionPhase): CompetitionDayPlan {
  switch (phase) {
    case 'near':
      return {
        phase,
        skipNormalSession: false,
        adjustment: { volumeMultiplier: 0.85, note: 'competition preparation — volume trimmed' },
        message: "Training adjusted around your upcoming competition — volume trimmed, today's main focus is preserved.",
      };
    case 'very_near':
      return {
        phase,
        skipNormalSession: false,
        adjustment: { volumeMultiplier: 0.6, skipHighImpact: true, note: 'competition preparation — low fatigue, skill preserved' },
        message: "Your competition is close, so today's session is lower-fatigue and focused on staying sharp, not building more fitness.",
      };
    case 'event_day':
      return {
        phase,
        skipNormalSession: true,
        adjustment: null,
        message: 'Competition Day — no normal training session today. Good luck!',
      };
    case 'post_event':
      return {
        phase,
        skipNormalSession: false,
        adjustment: { volumeMultiplier: 0.5, skipHighImpact: true, note: 'post-competition recovery' },
        message: 'Recovery recommended after your competition — today is a light, low-fatigue session.',
      };
    case 'far':
    case 'none':
    default:
      return NORMAL_DAY_PLAN;
  }
}

/** Deliberately simple day-count-to-event label, for UI/AI Coach copy — never a
 * claimed exact schedule, just how many calendar days remain. */
export function daysUntilEvent(event: CompetitionEvent, date: string): number | null {
  const from = parseLocalDateKey(date);
  const to = parseLocalDateKey(event.eventDate);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** The nearest upcoming (or, if none upcoming, most recent past) event as of
 * `date`, for display purposes only (spec §12/§14) — independent of whether
 * that event is currently inside its training-adjustment window. Used by the
 * Context Management UI / Home banner / AI Coach to answer "what's my next
 * competition" even when it's still far away and producing no adjustment yet. */
export function findUpcomingEvent(events: CompetitionEvent[], date: string): CompetitionEvent | null {
  const withDelta = events
    .map((event) => ({ event, delta: daysUntilEvent(event, date) }))
    .filter((e): e is { event: CompetitionEvent; delta: number } => e.delta !== null);

  const upcoming = withDelta.filter((e) => e.delta >= 0).sort((a, b) => (a.delta !== b.delta ? a.delta - b.delta : a.event.id.localeCompare(b.event.id)));
  if (upcoming.length > 0) return upcoming[0].event;

  const past = withDelta.filter((e) => e.delta < 0).sort((a, b) => (a.delta !== b.delta ? b.delta - a.delta : a.event.id.localeCompare(b.event.id)));
  return past.length > 0 ? past[0].event : null;
}
