import type { SportId } from '../sports/sports';

/**
 * Generic Training Context model (TRAVEL MODE + COMPETITION MODE spec §2/§9).
 *
 * The Base Plan (Sport Module program + assessment answers) is always the
 * source of truth. Travel/Competition contexts are temporary, persisted
 * OVERLAYS resolved for a given date — they never mutate the base plan
 * itself (see domain/context/resolveActiveContext.ts + travelEngine.ts +
 * competitionEngine.ts, which read a context and produce a derived
 * ResolvedWorkout/adjustment, exactly the same shape the existing
 * AiCoachAdjustment/ResolveContext machinery already consumes).
 *
 * Deliberately ONE structured context model per mode rather than scattered
 * booleans (`isTraveling`, `isCompetition`, ...) anywhere in the app.
 */
export type TrainingContextMode = 'normal' | 'travel' | 'competition';

/** How a context was created — for audit/history only, never branched on. */
export type ContextSource = 'athlete' | 'weekly_coaching';

export interface TravelTimeBudget {
  /** Minutes available for training on travel days, e.g. 15/20/30/45/60. */
  minutesAvailable: number;
}

/** The athlete's TEMPORARY equipment/location for the duration of Travel Mode —
 * independent from (and never overwriting) `AssessmentAnswers.equipmentIds` /
 * `trainingLocationIds`, spec §5. */
export interface TravelConstraints {
  equipmentIds: string[];
  locationIds: string[];
  time: TravelTimeBudget;
  /** Training days available while traveling, if different from the athlete's
   * normal `daysAvailablePerWeek` — undefined means "unchanged". */
  daysAvailablePerWeek?: number;
  /** Whether Travel Mode should also affect the Nutrition Engine's food
   * selection (spec §8) — defaults to false (training only) at creation time,
   * never silently turned on. */
  affectsNutrition: boolean;
}

export interface TravelContext {
  id: string;
  mode: 'travel';
  startDate: string; // YYYY-MM-DD (local), inclusive
  endDate: string; // YYYY-MM-DD (local), inclusive
  constraints: TravelConstraints;
  createdAt: string; // ISO timestamp
  source: ContextSource;
}

/** What kind of event Competition Mode is preparing for — sport-agnostic; a
 * sport module never has to be consulted to accept one of these (spec §31). */
export type CompetitionEventType = 'match' | 'race' | 'tournament' | 'event';

export interface CompetitionEvent {
  id: string;
  mode: 'competition';
  eventDate: string; // YYYY-MM-DD (local)
  eventTime?: string; // HH:MM, optional
  sport?: SportId;
  eventType: CompetitionEventType;
  /** Free-text label the athlete gave the event, e.g. "League Final" — display only. */
  label?: string;
  /** Days of taper/preparation before the event during which Competition Mode's
   * rules apply — see competitionEngine.ts's named PREP_WINDOW rules. Defaults to
   * the documented COMPETITION_DEFAULT_PREP_DAYS when not set explicitly. */
  preparationWindowDays?: number;
  /** Days after the event during which a recovery-oriented context applies —
   * defaults to COMPETITION_DEFAULT_RECOVERY_DAYS. */
  recoveryWindowDays?: number;
  createdAt: string;
  source: ContextSource;
}

export type AnyTemporaryContext = TravelContext | CompetitionEvent;

/** Named competition-preparation phases (spec §11) — deterministic, documented,
 * never treated as universal exact physiological truth. */
export type CompetitionPhase = 'far' | 'near' | 'very_near' | 'event_day' | 'post_event' | 'none';

/** The single resolved context for "today" (spec §14: deterministically select
 * the relevant active/upcoming event; reject silent overlap). */
export interface ResolvedContext {
  mode: TrainingContextMode;
  travel: TravelContext | null;
  competition: CompetitionEvent | null;
  competitionPhase: CompetitionPhase;
}
