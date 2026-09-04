import type { ExerciseCategory, ExerciseSlot } from './types';
import type { ProgressionModel, ProgressionModelConfig, ProgressionTarget } from '../progression/types';

/** The minimal shape model inference actually reads — lets callers (e.g. planEngine,
 * resolving an already-substituted exercise) pass a lean object instead of a full
 * authored `ExerciseSlot`. */
export type ProgressableSlot = Pick<ExerciseSlot, 'reps' | 'category' | 'equipment'>;

/**
 * Infers a `ProgressionModelConfig` from an `ExerciseSlot`'s EXISTING generic fields
 * (`reps` string, `category`, `equipment`) — never from the exercise's name or the
 * athlete's sport. This is the "exercise metadata defines the progression model"
 * abstraction the architecture rule requires: Football and Swimming exercises run
 * through the exact same inference, with zero changes to either sport module's
 * authored data.
 *
 * The `reps` string is the closest thing to authored intent already in the data
 * model (e.g. "8", "8-10", "25m", "15 sec", "10 / leg") — parsed once, deterministically,
 * in a fixed priority order: distance, then duration, then a numeric rep count/range.
 * Anything else (or warmup/cooldown, which are never progressed) falls back to a
 * no-numeric-progression 'technique' model.
 */

/** Default kg added when a load-model exercise's reps ceiling is met. Documented,
 * not tuned per exercise — every load-model exercise progresses by the same increment. */
export const DEFAULT_LOAD_INCREMENT_KG = 2.5;

const DISTANCE_RE = /^(\d+(?:\.\d+)?)\s*m(?:\s|$)/i;
const DURATION_RE = /(\d+(?:\.\d+)?)\s*(sec|min)\b/i;
const REP_RE = /^(\d+)(?:\s*-\s*(\d+))?/;

const NON_PROGRESSED_CATEGORIES: ExerciseCategory[] = ['warmup', 'cooldown'];

function parseDistanceOrDuration(reps: string): { model: 'distance' | 'duration' } | null {
  const distanceMatch = DISTANCE_RE.exec(reps);
  if (distanceMatch) return { model: 'distance' };
  const durationMatch = DURATION_RE.exec(reps);
  if (durationMatch) return { model: 'duration' };
  return null;
}

function parseRepRange(reps: string): { min: number; max: number } | null {
  const match = REP_RE.exec(reps.trim());
  if (!match) return null;
  const min = Number(match[1]);
  const max = match[2] !== undefined ? Number(match[2]) : min;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return null;
  return { min, max };
}

/** Re-parses a distance-model slot's own authored meters (e.g. "300m easy pace" -> 300),
 * for deriving the starting/base target. Null if unparseable — callers must treat that
 * as "unknown", never a fabricated distance. */
export function parseDistanceMeters(reps: string): number | null {
  const match = DISTANCE_RE.exec(reps);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Re-parses a duration-model slot's own authored seconds (e.g. "8 min" -> 480). */
export function parseDurationSeconds(reps: string): number | null {
  const match = DURATION_RE.exec(reps);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2].toLowerCase() === 'min' ? value * 60 : value;
}

function buildConfigForModel(model: ProgressionModel, slot: ProgressableSlot): ProgressionModelConfig {
  switch (model) {
    case 'distance':
      return { model: 'distance' };
    case 'duration':
      return { model: 'duration' };
    case 'technique':
      return { model: 'technique' };
    case 'load': {
      const repRange = parseRepRange(slot.reps);
      // Can't build a load model's numeric bounds without a parseable rep range — fall
      // back to 'technique' honestly rather than fabricate floor/ceiling values.
      if (!repRange) return { model: 'technique' };
      return { model: 'load', repFloor: repRange.min, repCeiling: repRange.max, loadIncrementKg: DEFAULT_LOAD_INCREMENT_KG };
    }
    case 'rep_range': {
      const repRange = parseRepRange(slot.reps);
      if (!repRange) return { model: 'technique' };
      return { model: 'rep_range', repFloor: repRange.min, repCeiling: repRange.max };
    }
  }
}

/**
 * Pure, deterministic — the same slot always infers the same model.
 *
 * When `preferredModel` is supplied (the exercise's own `ExerciseDefinition.progressionModel`
 * — see domain/exercise/types.ts), it's used directly instead of re-classifying from the reps
 * string: the Exercise Library is the single source of truth for "which model", this function
 * still owns "how to parse this slot's reps into that model's numeric bounds". Omitted/exercise
 * not yet in the library falls back to the original reps-string classification unchanged.
 *
 * Invariant: a exercise's canonical `preferredModel` describes what that named movement
 * generally supports (its identity) — it does NOT describe what's valid for *this particular
 * resolution* (its performed context). `slot.equipment` is always the actually-resolved
 * equipment for what the athlete is doing today (see planEngine.ts's `equipmentForModel`,
 * always `[]` for an equipment/injury/location substitution's bodyweight alternative). A
 * 'load' model can never be valid with zero resolved equipment — nothing external exists to
 * add load with — regardless of what the resolved exercise's own canonical metadata says.
 * When that contradiction occurs, fall through to the reps-string classification below,
 * which naturally lands on 'rep_range'/'technique' for an equipment-free slot. Every other
 * preferred model (including 'load' WITH equipment) is unaffected and still applies directly.
 */
export function inferProgressionModel(slot: ProgressableSlot, preferredModel?: ProgressionModel): ProgressionModelConfig | null {
  if (NON_PROGRESSED_CATEGORIES.includes(slot.category)) return null;

  const preferredModelIsValidForContext = preferredModel && !(preferredModel === 'load' && slot.equipment.length === 0);
  if (preferredModelIsValidForContext) return buildConfigForModel(preferredModel, slot);

  const distanceOrDuration = parseDistanceOrDuration(slot.reps);
  if (distanceOrDuration) return { model: distanceOrDuration.model };

  const repRange = parseRepRange(slot.reps);
  if (!repRange) return { model: 'technique' };

  const isLoadBearing = (slot.category === 'strength' || slot.category === 'power') && slot.equipment.length > 0;
  if (isLoadBearing) {
    return {
      model: 'load',
      repFloor: repRange.min,
      repCeiling: repRange.max,
      loadIncrementKg: DEFAULT_LOAD_INCREMENT_KG,
    };
  }

  return { model: 'rep_range', repFloor: repRange.min, repCeiling: repRange.max };
}

/**
 * The plan's own authored prescription for a slot, expressed as a `ProgressionTarget` —
 * what a first-ever exposure (no logged history yet) is prescribed, and the fallback
 * whenever a model has nothing numeric to progress (`technique`, or an unrecognized
 * model). Never fabricates a value the slot didn't already express: a load-model
 * exercise starts with `loadKg` undefined (no weight is authored anywhere in this
 * app — the athlete chooses and logs their own starting load).
 */
export function deriveBaseTarget(slot: ProgressableSlot & { sets: number }, config: ProgressionModelConfig | null): ProgressionTarget {
  if (!config) return { sets: slot.sets };
  switch (config.model) {
    case 'load':
      return { sets: slot.sets, reps: config.repFloor };
    case 'rep_range':
      return { sets: slot.sets, reps: config.repFloor };
    case 'distance':
      return { sets: slot.sets, distanceM: parseDistanceMeters(slot.reps) ?? undefined };
    case 'duration':
      return { sets: slot.sets, durationSec: parseDurationSeconds(slot.reps) ?? undefined };
    case 'technique':
      return { sets: slot.sets };
  }
}
