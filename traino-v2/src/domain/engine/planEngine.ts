import { getSportModule } from '../sports/registry';
import type { AiCoachAdjustment, ExerciseCategory, ExerciseSlot, UserProfile, WorkoutDayTemplate } from './types';
import type { ExerciseProgressionDecision } from '../progression/types';
import { applyProgression } from './progressionEngine';
import { applyExerciseProgression, type ExerciseProgressionContext } from './progressionIntegration';
import { isValidWeekNumber } from './validation';
import { addDays, daysBetween, localDateKey, parseLocalDateKey } from './dateUtils';

export interface ResolvedExercise {
  name: string;
  sets: number;
  reps: string;
  restSec?: number;
  category: ExerciseSlot['category'];
  /** Why the displayed name/reps differ from the slot's primary movement, if at all. */
  substitutionReason: 'none' | 'equipment' | 'location' | 'injury' | 'adjustment' | 'travel' | 'competition';
  /** The slot's original, pre-substitution movement name — set whenever
   * `substitutionReason !== 'none'`. Used for logging ("original exercise" vs
   * "actual exercise", spec §19) and by domain/context/travelEngine.ts to find a
   * richer Exercise-Intelligence-driven alternative than the authored
   * bodyweightAlternative when a partial equipment subset (not pure bodyweight)
   * is available. */
  sourceSlotName?: string;
  /** Present only when a `ResolveContext.progression` was supplied and this block is
   * progressable (not warmup/cooldown) — the structured decision behind `reps` above,
   * for the AI Coach / Progress screen / "why" UI. Evidence is always attached to this
   * exercise's own name (post-substitution), never the original contraindicated slot. */
  progression?: ExerciseProgressionDecision;
}

export interface ResolvedWorkout {
  id: string;
  name: string;
  focus: string;
  intensity: WorkoutDayTemplate['intensity'];
  durationMin: number;
  statCategory: WorkoutDayTemplate['statCategory'];
  exercises: ResolvedExercise[];
}

interface ResolveContext {
  equipmentIds: string[];
  locationIds: string[];
  injuryIds: string[];
  /** From an applied AI Coach adjustment — always prefer the bodyweight version. */
  forceBodyweight?: boolean;
  /** From an applied AI Coach adjustment — drop high-impact movements entirely. */
  skipHighImpact?: boolean;
  weekNumber?: number;
  /** Optional: when supplied, each resolvable exercise's target reps/load/duration/distance
   * is set by the Progression Engine (see progressionIntegration.ts) instead of the plan's
   * raw authored value — the calendar-block `applyProgression` below still runs regardless. */
  progression?: ExerciseProgressionContext;
  /** Target minutes for the whole session (spec: Deep Adaptive Assessment §13) — the
   * resolved day's non-warmup/cooldown volume is scaled to fit this budget and its
   * displayed `durationMin` is overridden to match, so display never contradicts
   * generation. Absent/falsy = no time-budget scaling (existing callers unaffected). */
  sessionDurationMin?: number;
  /** Combined, deterministic per-category volume-emphasis multiplier — the product of
   * the athlete's performancePriority, their sport-module position/discipline emphasis
   * (spec: Core Personalization Polish §1-§3), and their competitiveLevel (spec §8),
   * merged once in `baseContext()` (see `mergeCategoryEmphasis`). A single combined map
   * rather than three separate passes so the composed effect is easy to reason about
   * and test. Absent = no emphasis applied. */
  categoryEmphasis?: Partial<Record<ExerciseCategory, number>>;
}

/** Deterministic per-category set-volume emphasis for a stated training priority —
 * the one place this small, explainable rule lives, shared by every path that resolves
 * a day. Never a new exercise, never sport-specific: purely a multiplier over whatever
 * categories the athlete's actual (already equipment/injury-resolved) exercises fall
 * into, so it composes safely with every substitution already applied above. */
const PRIORITY_CATEGORY_EMPHASIS: Record<'speed' | 'strength' | 'conditioning', Partial<Record<ExerciseCategory, number>>> = {
  speed: { conditioning: 1.15, power: 1.15, strength: 0.9 },
  strength: { strength: 1.15, power: 1.05, conditioning: 0.9 },
  conditioning: { conditioning: 1.2, power: 1.05, strength: 0.9 },
};

/** Conservative, generic competitive-level emphasis (spec §8/§10, Core Personalization
 * Polish) — a small nudge toward match-readiness (conditioning/power) at higher
 * competitive levels and toward foundational strength at the beginner level. Deltas
 * stay small (<=8%) since this is a secondary signal composed with performancePriority
 * and position emphasis, never a rule that alone reshapes a session. */
const COMPETITIVE_LEVEL_EMPHASIS: Record<
  'beginner' | 'amateur' | 'competitive' | 'semi_pro' | 'professional',
  Partial<Record<ExerciseCategory, number>>
> = {
  beginner: { strength: 1.05 },
  amateur: {},
  competitive: { conditioning: 1.05, power: 1.05 },
  semi_pro: { conditioning: 1.08, power: 1.08, strength: 0.97 },
  professional: { conditioning: 1.08, power: 1.08, strength: 0.97 },
};

/** Multiplies overlapping categories together and unions the rest — how
 * performancePriority + position emphasis + competitiveLevel emphasis combine into
 * one `categoryEmphasis` map (spec: personalization signals compose, none silently
 * overrides another). */
function mergeCategoryEmphasis(
  maps: Partial<Record<ExerciseCategory, number>>[]
): Partial<Record<ExerciseCategory, number>> {
  const merged: Partial<Record<ExerciseCategory, number>> = {};
  for (const map of maps) {
    for (const [category, multiplier] of Object.entries(map) as [ExerciseCategory, number][]) {
      merged[category] = (merged[category] ?? 1) * multiplier;
    }
  }
  return merged;
}

function resolveExercise(slot: ExerciseSlot, ctx: ResolveContext): ResolvedExercise | null {
  if (ctx.skipHighImpact && slot.highImpact) {
    return null;
  }

  const missingEquipment = slot.equipment.length > 0 && !slot.equipment.some((id) => ctx.equipmentIds.includes(id));
  const wrongLocation =
    (slot.locations ?? []).length > 0 && !slot.locations!.some((loc) => ctx.locationIds.includes(loc));
  const injuryFlagged = (slot.contraindications ?? []).some((tag) => ctx.injuryIds.includes(tag));
  // A "prefer bodyweight" adjustment (traveling, pain-safe, weekly-coaching equipment/travel
  // recommendations) only means anything for a slot that actually requires equipment or a
  // specific location — an already-equipment-free, location-unconstrained slot (Warm Up,
  // Cool Down, or any bodyweight exercise) has nothing to swap away from and must never be
  // dropped just because forceBodyweight is set.
  const forceBodyweightApplies = ctx.forceBodyweight && (slot.equipment.length > 0 || (slot.locations?.length ?? 0) > 0);
  const shouldSubstitute = forceBodyweightApplies || missingEquipment || wrongLocation || injuryFlagged;

  if (shouldSubstitute && !slot.bodyweightAlternative) {
    // No safe/available substitute exists for this slot — drop it rather than
    // emit the original movement (which is either unavailable/infeasible, or
    // for an injury match, exactly the movement the athlete should be avoiding).
    return null;
  }

  let base: ResolvedExercise;
  if (shouldSubstitute && slot.bodyweightAlternative) {
    const reason: ResolvedExercise['substitutionReason'] = injuryFlagged
      ? 'injury'
      : missingEquipment
        ? 'equipment'
        : wrongLocation
          ? 'location'
          : 'adjustment';
    base = {
      name: slot.bodyweightAlternative.name,
      sets: slot.sets,
      reps: slot.bodyweightAlternative.reps,
      restSec: slot.restSec,
      category: slot.category,
      substitutionReason: reason,
      sourceSlotName: slot.name,
    };
  } else {
    base = {
      name: slot.name,
      sets: slot.sets,
      reps: slot.reps,
      restSec: slot.restSec,
      category: slot.category,
      substitutionReason: 'none',
    };
  }

  if (ctx.progression) {
    // Model inference reads whatever's actually being resolved today — the substitute's
    // own reps/category and its equipment (bodyweightAlternative is always equipment-free
    // by contract), never the original slot when a substitution occurred. Evidence and the
    // resulting target stay attached to `base.name`, so a knee-safe substitute's history
    // can never be used to progress — or reintroduce — the original contraindicated move.
    const equipmentForModel = shouldSubstitute && slot.bodyweightAlternative ? [] : slot.equipment;
    const progressed = applyExerciseProgression(base, equipmentForModel, ctx.progression);
    if (progressed) {
      base = { ...base, reps: progressed.reps, progression: progressed.decision };
    }
  }

  return ctx.weekNumber ? applyProgression(base, ctx.weekNumber) : base;
}

function resolveDay(day: WorkoutDayTemplate, ctx: ResolveContext): ResolvedWorkout {
  const exercises = day.exercises
    .map((slot) => resolveExercise(slot, ctx))
    .filter((ex): ex is ResolvedExercise => ex !== null);

  let resolved: ResolvedWorkout = {
    id: day.id,
    name: day.name,
    focus: day.focus,
    intensity: day.intensity,
    durationMin: day.durationMin,
    statCategory: day.statCategory,
    exercises,
  };

  // Combined category-emphasis (performancePriority + position + competitiveLevel —
  // a category-relative multiplier over the authored volume) first, then the
  // session-duration time budget (a whole-day scale that also re-bases the displayed
  // duration) — order matters only in that duration is always the last word on
  // what's actually displayed, per spec §13.
  if (ctx.categoryEmphasis) {
    resolved = applyCategoryEmphasis(resolved, ctx.categoryEmphasis);
  }
  if (ctx.sessionDurationMin) {
    resolved = applySessionDurationBudget(resolved, ctx.sessionDurationMin);
  }

  return resolved;
}

function applyCategoryEmphasis(resolved: ResolvedWorkout, categoryMultipliers: Partial<Record<ExerciseCategory, number>>): ResolvedWorkout {
  return {
    ...resolved,
    exercises: resolved.exercises.map((ex) => {
      const multiplier = categoryMultipliers[ex.category as ExerciseCategory];
      if (!multiplier || ex.category === 'warmup' || ex.category === 'cooldown') return ex;
      return { ...ex, sets: Math.max(1, Math.round(ex.sets * multiplier)) };
    }),
  };
}

/** Scales the whole day's volume to fit the athlete's requested session length and
 * re-bases `durationMin` to that same request (clamped to a sane range) — the
 * displayed duration and the generated volume must never disagree (spec §13). A
 * ratio outside [0.5, 1.4] is clamped so an extreme request (e.g. 10 min for a
 * 55 min authored day) degrades the session rather than emptying or exploding it. */
function applySessionDurationBudget(resolved: ResolvedWorkout, sessionDurationMin: number): ResolvedWorkout {
  const authoredDuration = resolved.durationMin > 0 ? resolved.durationMin : 45;
  const ratio = sessionDurationMin / authoredDuration;
  const multiplier = Math.min(1.4, Math.max(0.5, ratio));
  const scaled = applyVolumeMultiplier(resolved, multiplier);
  const displayDuration = Math.min(120, Math.max(15, Math.round(authoredDuration * multiplier)));
  return { ...scaled, durationMin: displayDuration };
}

function baseContext(profile: UserProfile, weekNumber = 1, progression?: ExerciseProgressionContext): ResolveContext {
  // A NaN/negative/non-integer week number (corrupt state, a bad progression calc) must
  // never reach applyProgression's arithmetic — it would propagate as a NaN set count.
  const safeWeekNumber = isValidWeekNumber(weekNumber) ? weekNumber : 1;

  const priorityMap = PRIORITY_CATEGORY_EMPHASIS[profile.answers.performancePriority ?? 'strength'];
  const position = getSportModule(profile.answers.sport).positions?.find((p) => p.id === profile.answers.sportPositionId);
  const positionMap = position?.emphasis ?? {};
  const competitiveLevelMap = profile.answers.competitiveLevel ? COMPETITIVE_LEVEL_EMPHASIS[profile.answers.competitiveLevel] : {};

  return {
    equipmentIds: profile.answers.equipmentIds,
    locationIds: profile.answers.trainingLocationIds,
    injuryIds: profile.answers.injuryIds,
    weekNumber: safeWeekNumber,
    progression,
    sessionDurationMin: profile.answers.sessionDurationMin ?? 45,
    categoryEmphasis: mergeCategoryEmphasis([priorityMap, positionMap, competitiveLevelMap]),
  };
}

/** Matches/week is a generic weekly-load signal (spec §9, Core Personalization Polish):
 * more competitive events on top of training modestly reduces effective training
 * capacity, regardless of sport — this reads a generic optional field, never branches
 * on sport id. Capped so it can reduce frequency by at most 2 days and never below 1.
 * A real Competition Mode event (domain/context/competitionEngine.ts) remains the
 * authoritative day-level override for an actual match day; this only shapes the
 * WEEKLY schedule's training-day count, so the two never double-count the same thing. */
function effectiveTrainingFrequency(daysAvailablePerWeek: number, matchesPerWeek: number | undefined): number {
  const requested = daysAvailablePerWeek > 0 ? daysAvailablePerWeek : 3;
  if (!matchesPerWeek || matchesPerWeek <= 0) return requested;
  const reduction = Math.min(2, Math.floor(matchesPerWeek / 2));
  return Math.max(1, requested - reduction);
}

/**
 * Which day of a weekly program cycle "today" is — a pure function of
 * the real calendar (ISO weekday, Monday=0) modulo the program's length,
 * so the plan actually rotates day to day instead of always showing the
 * first template.
 */
export function todayDayIndex(programLength: number, date: Date = new Date()): number {
  const isoWeekday = (date.getDay() + 6) % 7; // Mon=0 .. Sun=6
  return isoWeekday % programLength;
}

/** How many real calendar days `referenceDate` is past `planStartDate` (never
 * negative — a corrupt/future planStartDate reads as "day 0", not a negative
 * offset that would break the modulo below). */
function daysSincePlanStart(planStartDate: string | null | undefined, referenceDate: Date): number {
  const start = planStartDate ? parseLocalDateKey(planStartDate) : null;
  if (!start) return 0;
  return Math.max(0, daysBetween(start, referenceDate));
}

/**
 * Which day of the ATHLETE'S OWN 7-day training cycle `referenceDate` is —
 * anchored to when their plan started (cycle day 0), never the real ISO
 * calendar week. This is what makes Rest/Training assignment both correct
 * product behavior (an athlete who builds their plan on a Sunday shouldn't
 * start on a rest day — day 0 of any cycle is always a training day, see
 * `trainingDaySlots`) and safe to test deterministically regardless of which
 * real weekday a test happens to run on.
 */
export function cycleDayIndexFor(planStartDate: string | null | undefined, referenceDate: Date = new Date()): number {
  return daysSincePlanStart(planStartDate, referenceDate) % 7;
}

/** The training-day ORDINAL (0, 1, 2, ...) `cycleDayIndex` is within this
 * frequency's `trainingDaySlots` pattern, or null if `cycleDayIndex` is a rest
 * day — the single place both `generatePersonalizedWeek` and "today" resolution
 * decide which of the sport's day templates to use, so they can never disagree. */
function trainingOrdinalForCycleDay(freq: number, cycleDayIndex: number): number | null {
  const slots = trainingDaySlots(freq);
  const ordinal = slots.indexOf(cycleDayIndex);
  return ordinal === -1 ? null : ordinal;
}

/**
 * Resolves the day template for `dayIndex` (an explicit historical/relative
 * lookup — e.g. Progress/Weekly Report's day-by-day history) or, when omitted,
 * for "today". Passing `planStartDate` (even `null`, meaning "no plan yet")
 * switches "today" to the plan-cycle-aware resolution used everywhere else in
 * this file (spec: Core Personalization Polish §15/§21); omitting it entirely
 * keeps the original real-ISO-weekday behavior for callers that don't yet
 * thread `planStartDate` through (e.g. Travel Mode's own template choice,
 * spec §14 — travel's existing behavior is preserved, not required to change).
 */
function dayForIndex(
  profile: UserProfile,
  dayIndex?: number,
  planStartDate?: string | null,
  referenceDate: Date = new Date()
): WorkoutDayTemplate {
  const sportModule = getSportModule(profile.answers.sport);
  const days = sportModule.program[profile.level];

  if (dayIndex !== undefined) {
    return days[dayIndex % days.length];
  }
  if (planStartDate !== undefined) {
    const freq = effectiveTrainingFrequency(profile.answers.daysAvailablePerWeek, profile.answers.matchesPerWeek);
    const cycleDayIndex = cycleDayIndexFor(planStartDate, referenceDate);
    const ordinal = trainingOrdinalForCycleDay(freq, cycleDayIndex) ?? 0;
    return days[ordinal % days.length];
  }
  return days[todayDayIndex(days.length, referenceDate) % days.length];
}

/** The full weekly cycle for the athlete's sport/level, equipment- and injury-resolved, in order. */
export function generateWeekProgram(profile: UserProfile, weekNumber = 1): ResolvedWorkout[] {
  const sportModule = getSportModule(profile.answers.sport);
  const days = sportModule.program[profile.level];
  const ctx = baseContext(profile, weekNumber);
  return days.map((day) => resolveDay(day, ctx));
}

export interface WeekPlanDay {
  /** 0-6 — this athlete's own cycle day (0 = the day their plan started), NOT the
   * real ISO weekday. Two athletes who started their plans on different real days
   * can have the same `cycleDayIndex` map to different calendar dates. */
  cycleDayIndex: number;
  /** The real calendar date (YYYY-MM-DD) this row represents. */
  date: string;
  type: 'training' | 'rest';
  /** Present only when `type === 'training'`. */
  workout?: ResolvedWorkout;
}

/**
 * Deterministically spreads `freq` training days across a 7-day week —
 * e.g. freq=3 -> 3 evenly-spaced days, freq=7 -> every day. Pure arithmetic
 * (no Math.random/Date.now), so the same frequency always produces the same
 * slot pattern (spec §12/§38). `i * 7 / n` strictly increases by >= 1 for
 * every n in [1, 7], so rounding can never collide two i's onto the same day.
 */
function trainingDaySlots(freq: number): number[] {
  const n = Math.min(7, Math.max(1, Math.round(freq)));
  const slots: number[] = [];
  for (let i = 0; i < n; i++) {
    slots.push(Math.round((i * 7) / n) % 7);
  }
  return slots;
}

/**
 * The athlete's full personalized week — the primary "Plan" experience (spec
 * §17/§18): exactly `effectiveTrainingFrequency` training days (built from the
 * sport's existing level-appropriate day templates, cycled through and
 * resolved exactly like `generateWeekProgram` — equipment/injury substitution,
 * category emphasis and session-duration budgeting all apply), the rest marked
 * `rest`. A pure function of the profile + planStartDate + referenceDate: same
 * inputs always produce the same week (spec §10/§29/§38); a materially
 * different profile (different frequency, duration, priority, position,
 * competitive level, matches/week, equipment, location, or injuries) produces
 * a materially different one (spec §11/§5). The returned week always includes
 * `referenceDate` (default: today) at whatever `cycleDayIndex` it falls on —
 * see `resolveTodayPlanDay` for the single-day version Home/Today's Workout use.
 */
export function generatePersonalizedWeek(
  profile: UserProfile,
  planStartDate?: string | null,
  referenceDate: Date = new Date(),
  weekNumber = 1
): WeekPlanDay[] {
  const sportModule = getSportModule(profile.answers.sport);
  const templates = sportModule.program[profile.level];
  const freq = effectiveTrainingFrequency(profile.answers.daysAvailablePerWeek, profile.answers.matchesPerWeek);
  const slots = trainingDaySlots(freq);
  const trainingSlotSet = new Set(slots);
  const ctx = baseContext(profile, weekNumber);

  const todayCycleIndex = cycleDayIndexFor(planStartDate, referenceDate);
  const weekStartDate = addDays(referenceDate, -todayCycleIndex);

  const week: WeekPlanDay[] = [];
  for (let cycleDayIndex = 0; cycleDayIndex < 7; cycleDayIndex++) {
    const date = localDateKey(addDays(weekStartDate, cycleDayIndex));
    if (trainingSlotSet.has(cycleDayIndex)) {
      const ordinal = slots.indexOf(cycleDayIndex);
      const template = templates[ordinal % templates.length];
      week.push({ cycleDayIndex, date, type: 'training', workout: resolveDay(template, ctx) });
    } else {
      week.push({ cycleDayIndex, date, type: 'rest' });
    }
  }
  return week;
}

export interface TodayPlanResolution {
  type: 'training' | 'rest';
  /** Present only when `type === 'training'`. */
  workout?: ResolvedWorkout;
  cycleDayIndex: number;
}

/**
 * Resolves exactly what TODAY is per the athlete's generated weekly plan (spec:
 * Core Personalization Polish §11/§15/§17) — the single source of truth
 * Home/Today's Workout gate on before showing/hiding "START WORKOUT". Uses the
 * exact same frequency + template-ordinal logic as `generatePersonalizedWeek`
 * (both call `trainingOrdinalForCycleDay`), so the two screens can never
 * disagree about what today is or which session it shows.
 */
export function resolveTodayPlanDay(
  profile: UserProfile,
  planStartDate: string | null | undefined,
  referenceDate: Date = new Date(),
  weekNumber = 1
): TodayPlanResolution {
  const cycleDayIndex = cycleDayIndexFor(planStartDate, referenceDate);
  const freq = effectiveTrainingFrequency(profile.answers.daysAvailablePerWeek, profile.answers.matchesPerWeek);
  const ordinal = trainingOrdinalForCycleDay(freq, cycleDayIndex);
  if (ordinal === null) {
    return { type: 'rest', cycleDayIndex };
  }
  const sportModule = getSportModule(profile.answers.sport);
  const templates = sportModule.program[profile.level];
  const template = templates[ordinal % templates.length];
  const ctx = baseContext(profile, weekNumber);
  return { type: 'training', workout: resolveDay(template, ctx), cycleDayIndex };
}

/**
 * Today's workout, resolved against the athlete's generated plan cycle when
 * `planStartDate` is supplied (spec §15/§21 — same day-template choice as
 * `generatePersonalizedWeek`/`resolveTodayPlanDay`), or the original real-ISO-
 * weekday cycling when it's omitted (existing callers that don't yet thread
 * `planStartDate` through, e.g. Travel Mode — see `dayForIndex`). Pass
 * `dayIndex` explicitly to look at a specific day of the cycle (e.g. for the
 * history behind Progress/Weekly Report) — this always wins over both.
 */
export function generateTodayWorkout(
  profile: UserProfile,
  dayIndex?: number,
  weekNumber = 1,
  progression?: ExerciseProgressionContext,
  planStartDate?: string | null,
  referenceDate: Date = new Date()
): ResolvedWorkout {
  return resolveDay(dayForIndex(profile, dayIndex, planStartDate, referenceDate), baseContext(profile, weekNumber, progression));
}

/** Scales every non-warmup/cooldown block's sets by `multiplier` (a no-op for an
 * invalid/absent multiplier) — the one place volume-scaling math lives, shared by
 * `applyCoachAdjustment` and `generateContextAdjustedWorkout` below rather than
 * duplicated between them. */
function applyVolumeMultiplier(resolved: ResolvedWorkout, multiplier: number | undefined): ResolvedWorkout {
  if (!multiplier || Number.isNaN(multiplier) || multiplier <= 0) return resolved;
  return {
    ...resolved,
    exercises: resolved.exercises.map((ex) =>
      ex.category === 'warmup' || ex.category === 'cooldown'
        ? ex
        : { ...ex, sets: Math.max(1, Math.round(ex.sets * multiplier)) }
    ),
  };
}

/**
 * Applies a deterministic AI Coach adjustment (see aiCoachEngine.ts) to
 * today's workout — forcing bodyweight substitutions, dropping
 * high-impact movements, and/or scaling volume — rather than just
 * describing the change as text.
 */
export function applyCoachAdjustment(
  profile: UserProfile,
  dayIndex: number | undefined,
  adjustment: AiCoachAdjustment,
  weekNumber = 1,
  progression?: ExerciseProgressionContext,
  planStartDate?: string | null,
  referenceDate: Date = new Date()
): ResolvedWorkout {
  const day = dayForIndex(profile, dayIndex, planStartDate, referenceDate);

  const ctx: ResolveContext = {
    ...baseContext(profile, weekNumber, progression),
    forceBodyweight: adjustment.swapToBodyweight,
    skipHighImpact: adjustment.skipHighImpact,
  };

  return applyVolumeMultiplier(resolveDay(day, ctx), adjustment.volumeMultiplier);
}

/** Overrides for a temporary Training Context (Travel/Competition, see
 * domain/context/) resolving today's workout — reuses the exact same
 * `ResolveContext`/`resolveDay` substitution machinery `generateTodayWorkout`
 * and `applyCoachAdjustment` already use, just with equipment/location
 * overridden instead of read straight from the athlete's stored profile. */
export interface ContextOverride {
  /** Temporary equipment available for the duration of the context — replaces
   * `profile.answers.equipmentIds` for this resolution only; the stored
   * profile is never mutated. */
  equipmentIds?: string[];
  locationIds?: string[];
  adjustment?: AiCoachAdjustment;
}

export function generateContextAdjustedWorkout(
  profile: UserProfile,
  dayIndex: number | undefined,
  override: ContextOverride,
  weekNumber = 1,
  progression?: ExerciseProgressionContext
): ResolvedWorkout {
  const day = dayForIndex(profile, dayIndex);

  const ctx: ResolveContext = {
    ...baseContext(profile, weekNumber, progression),
    equipmentIds: override.equipmentIds ?? profile.answers.equipmentIds,
    locationIds: override.locationIds ?? profile.answers.trainingLocationIds,
    forceBodyweight: override.adjustment?.swapToBodyweight,
    skipHighImpact: override.adjustment?.skipHighImpact,
  };

  return applyVolumeMultiplier(resolveDay(day, ctx), override.adjustment?.volumeMultiplier);
}
