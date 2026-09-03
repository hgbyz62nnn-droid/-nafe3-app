import type { ExerciseCategory, ExerciseSlot, FitnessLevel, PerformanceCategory, SportModuleData, WorkoutDayTemplate } from '../engine/types';

/**
 * Sport Module contract check. A new sport is meant to be addable as pure
 * structured data (one program file + one registry line) with zero engine
 * changes — which only holds if every module actually satisfies the shape
 * the engine assumes. This is a development/test-time gate, not a runtime
 * fallback: `registry.ts` runs it against every registered module at
 * import time and throws immediately on a violation, so a malformed
 * module fails a `tsc -b`/test/dev-server run rather than silently
 * producing a partially-valid plan for an athlete at runtime.
 */

export interface SportModuleValidationResult {
  valid: boolean;
  errors: string[];
}

const FITNESS_LEVELS: FitnessLevel[] = ['beginner', 'intermediate', 'advanced'];
const STAT_CATEGORIES: PerformanceCategory[] = ['speed', 'strength', 'stamina'];
const EXERCISE_CATEGORIES: ExerciseCategory[] = ['warmup', 'strength', 'power', 'conditioning', 'technique', 'cooldown'];
const CARB_BIASES = ['low', 'moderate', 'high'];

function validateExerciseSlot(slot: ExerciseSlot, path: string, errors: string[]): void {
  if (!slot || typeof slot.name !== 'string' || slot.name.trim() === '') {
    errors.push(`${path}: missing exercise name`);
  }
  if (typeof slot.sets !== 'number' || Number.isNaN(slot.sets) || slot.sets <= 0) {
    errors.push(`${path} (${slot?.name ?? 'unnamed'}): sets must be a positive number, got ${slot?.sets}`);
  }
  if (typeof slot.reps !== 'string' || slot.reps.trim() === '') {
    errors.push(`${path} (${slot?.name ?? 'unnamed'}): missing reps`);
  }
  if (!Array.isArray(slot.equipment)) {
    errors.push(`${path} (${slot?.name ?? 'unnamed'}): equipment must be an array (use [] for bodyweight)`);
  }
  if (!EXERCISE_CATEGORIES.includes(slot.category)) {
    errors.push(`${path} (${slot?.name ?? 'unnamed'}): invalid category "${slot?.category}" — this also breaks progression, which keys off category`);
  }
  // A slot that can be blocked (equipment/location required, or flagged as contraindicated
  // for some injury) but has no bodyweightAlternative gets silently DROPPED at runtime by
  // planEngine's safety fallback — not wrong, but worth flagging so an author notices a
  // day could end up thin for an equipment-limited or injured athlete.
  const canBeBlocked = slot.equipment.length > 0 || (slot.locations?.length ?? 0) > 0 || (slot.contraindications?.length ?? 0) > 0;
  if (canBeBlocked && !slot.bodyweightAlternative && slot.category !== 'warmup' && slot.category !== 'cooldown') {
    errors.push(`${path} (${slot?.name ?? 'unnamed'}): can be blocked by equipment/location/injury but has no bodyweightAlternative — will be silently dropped rather than shown`);
  }
}

function validateDayTemplate(day: WorkoutDayTemplate, path: string, errors: string[]): void {
  if (!day || typeof day.id !== 'string' || day.id.trim() === '') {
    errors.push(`${path}: missing day id`);
  }
  if (!day || typeof day.name !== 'string' || day.name.trim() === '') {
    errors.push(`${path} (${day?.id ?? 'unknown'}): missing day name`);
  }
  if (!STAT_CATEGORIES.includes(day?.statCategory as PerformanceCategory)) {
    errors.push(`${path} (${day?.id ?? 'unknown'}): missing/invalid statCategory (required so Progress can bucket it without guessing from the name)`);
  }
  if (typeof day?.durationMin !== 'number' || Number.isNaN(day.durationMin) || day.durationMin <= 0) {
    errors.push(`${path} (${day?.id ?? 'unknown'}): durationMin must be a positive number`);
  }
  if (!Array.isArray(day?.exercises) || day.exercises.length === 0) {
    errors.push(`${path} (${day?.id ?? 'unknown'}): must have at least one exercise`);
    return;
  }
  day.exercises.forEach((slot, i) => validateExerciseSlot(slot, `${path} (${day.id}).exercises[${i}]`, errors));
}

export function validateSportModule(module: SportModuleData): SportModuleValidationResult {
  const errors: string[] = [];

  if (!module || typeof module.id !== 'string' || module.id.trim() === '') {
    errors.push('module: missing required id');
  }

  if (!module?.program) {
    errors.push('module.program: missing');
  } else {
    for (const level of FITNESS_LEVELS) {
      const days = module.program[level];
      if (!Array.isArray(days) || days.length === 0) {
        errors.push(`module.program.${level}: missing or empty training templates — every supported experience level needs at least one day`);
        continue;
      }
      days.forEach((day, i) => validateDayTemplate(day, `program.${level}[${i}]`, errors));
    }
  }

  if (!module?.nutritionProfile) {
    errors.push('module.nutritionProfile: missing');
  } else {
    const { proteinGPerKg, carbBias } = module.nutritionProfile;
    if (typeof proteinGPerKg !== 'number' || Number.isNaN(proteinGPerKg) || proteinGPerKg <= 0) {
      errors.push(`module.nutritionProfile.proteinGPerKg: must be a positive number, got ${proteinGPerKg}`);
    }
    if (!CARB_BIASES.includes(carbBias)) {
      errors.push(`module.nutritionProfile.carbBias: invalid value "${carbBias}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validates a module and throws with every violation listed if it fails the contract —
 * for use at registration time so a malformed module fails fast (dev server, build, test
 * run) instead of reaching an athlete as a partially-valid plan. */
export function assertValidSportModule(module: SportModuleData): void {
  const result = validateSportModule(module);
  if (!result.valid) {
    throw new Error(
      `Sport Module "${module?.id ?? '(unknown)'}" failed contract validation:\n` +
        result.errors.map((e) => `  - ${e}`).join('\n')
    );
  }
}
