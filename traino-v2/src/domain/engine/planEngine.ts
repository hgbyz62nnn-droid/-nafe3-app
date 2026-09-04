import { getSportModule } from '../sports/registry';
import type { AiCoachAdjustment, ExerciseCategory, ExerciseSlot, UserProfile, WorkoutDayTemplate } from './types';
import type { ExerciseProgressionDecision } from '../progression/types';
import { applyProgression } from './progressionEngine';
import { applyExerciseProgression, type ExerciseProgressionContext } from './progressionIntegration';
import { isValidWeekNumber } from './validation';

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
  /** Generic per-category volume emphasis (spec §11/§16) — a deterministic multiplier,
   * never a new exercise or a sport-specific rule. Absent = no emphasis applied. */
  performancePriority?: 'speed' | 'strength' | 'conditioning';
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

  // Performance-priority emphasis first (a category-relative multiplier over the
  // authored volume), then the session-duration time budget (a whole-day scale that
  // also re-bases the displayed duration) — order matters only in that duration is
  // always the last word on what's actually displayed, per spec §13.
  if (ctx.performancePriority) {
    resolved = applyPriorityEmphasis(resolved, ctx.performancePriority);
  }
  if (ctx.sessionDurationMin) {
    resolved = applySessionDurationBudget(resolved, ctx.sessionDurationMin);
  }

  return resolved;
}

function applyPriorityEmphasis(resolved: ResolvedWorkout, priority: 'speed' | 'strength' | 'conditioning'): ResolvedWorkout {
  const categoryMultipliers = PRIORITY_CATEGORY_EMPHASIS[priority];
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
  return {
    equipmentIds: profile.answers.equipmentIds,
    locationIds: profile.answers.trainingLocationIds,
    injuryIds: profile.answers.injuryIds,
    weekNumber: safeWeekNumber,
    progression,
    sessionDurationMin: profile.answers.sessionDurationMin ?? 45,
    performancePriority: profile.answers.performancePriority ?? 'strength',
  };
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

function dayForIndex(profile: UserProfile, dayIndex?: number): WorkoutDayTemplate {
  const sportModule = getSportModule(profile.answers.sport);
  const days = sportModule.program[profile.level];
  const index = dayIndex ?? todayDayIndex(days.length);
  return days[index % days.length];
}

/** The full weekly cycle for the athlete's sport/level, equipment- and injury-resolved, in order. */
export function generateWeekProgram(profile: UserProfile, weekNumber = 1): ResolvedWorkout[] {
  const sportModule = getSportModule(profile.answers.sport);
  const days = sportModule.program[profile.level];
  const ctx = baseContext(profile, weekNumber);
  return days.map((day) => resolveDay(day, ctx));
}

export interface WeekPlanDay {
  /** Monday=0 .. Sunday=6, matching `todayDayIndex`'s convention. */
  dayOfWeek: number;
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
 * §17/§18): exactly `daysAvailablePerWeek` training days (built from the
 * sport's existing level-appropriate day templates, cycled through and
 * resolved exactly like `generateWeekProgram` — equipment/injury substitution,
 * performance-priority emphasis and session-duration budgeting all apply),
 * the rest marked `rest`. A pure function of the profile: same profile + same
 * week number always produces the same week (spec §10/§38); a materially
 * different profile (different frequency, duration, priority, equipment,
 * location, or injuries) produces a materially different one (spec §11/§41).
 */
export function generatePersonalizedWeek(profile: UserProfile, weekNumber = 1): WeekPlanDay[] {
  const sportModule = getSportModule(profile.answers.sport);
  const templates = sportModule.program[profile.level];
  const freq = profile.answers.daysAvailablePerWeek > 0 ? profile.answers.daysAvailablePerWeek : 3;
  const trainingSlots = new Set(trainingDaySlots(freq));
  const ctx = baseContext(profile, weekNumber);

  let templateIndex = 0;
  const week: WeekPlanDay[] = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    if (trainingSlots.has(dayOfWeek)) {
      const template = templates[templateIndex % templates.length];
      templateIndex++;
      week.push({ dayOfWeek, type: 'training', workout: resolveDay(template, ctx) });
    } else {
      week.push({ dayOfWeek, type: 'rest' });
    }
  }
  return week;
}

/**
 * Today's workout, cycling deterministically through the weekly program
 * by real day-of-week rather than picking randomly. Pass `dayIndex`
 * explicitly to look at a specific day of the cycle (e.g. for the
 * history behind Progress/Weekly Report); omit it to mean "today".
 */
export function generateTodayWorkout(
  profile: UserProfile,
  dayIndex?: number,
  weekNumber = 1,
  progression?: ExerciseProgressionContext
): ResolvedWorkout {
  return resolveDay(dayForIndex(profile, dayIndex), baseContext(profile, weekNumber, progression));
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
  progression?: ExerciseProgressionContext
): ResolvedWorkout {
  const day = dayForIndex(profile, dayIndex);

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
