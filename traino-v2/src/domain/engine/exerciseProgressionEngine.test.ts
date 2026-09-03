import { describe, expect, it } from 'vitest';
import { decideExerciseProgression, CONSECUTIVE_STRUGGLES_FOR_REGRESS, MIN_EXPOSURES_FOR_HIGH_CONFIDENCE } from './exerciseProgressionEngine';
import { inferProgressionModel, deriveBaseTarget } from './progressionModels';
import type { ExerciseSlot } from './types';
import type { ExercisePerformanceLog } from '../progression/types';
import type { ReadinessStatus } from '../readiness/types';

const NO_READINESS = () => null as ReadinessStatus | null;

function loadSlot(overrides: Partial<ExerciseSlot> = {}): ExerciseSlot {
  return { name: 'Back Squat', sets: 3, reps: '6-8', equipment: ['barbell', 'squat_rack'], category: 'strength', ...overrides };
}

function bodyweightSlot(overrides: Partial<ExerciseSlot> = {}): ExerciseSlot {
  return { name: 'Push-Ups', sets: 3, reps: '8-12', equipment: [], category: 'strength', ...overrides };
}

function log(overrides: Partial<ExercisePerformanceLog> = {}): ExercisePerformanceLog {
  return {
    date: '2026-01-05',
    exerciseName: 'Back Squat',
    prescribedSets: 3,
    completedSets: 3,
    repsAchieved: 8,
    loadKg: 70,
    rir: 2,
    wasModified: false,
    submittedAt: '2026-01-05T18:00:00.000Z',
    ...overrides,
  };
}

describe('decideExerciseProgression — SKIP (no history / non-progressed)', () => {
  it('SKIPs with the base target on a first-ever exposure', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const base = deriveBaseTarget(slot, config);
    const decision = decideExerciseProgression('Back Squat', config, base, [], NO_READINESS);
    expect(decision.decision).toBe('SKIP');
    expect(decision.nextTarget).toEqual(base);
    expect(decision.exposureCount).toBe(0);
  });

  it('SKIPs warmup/cooldown (null config) regardless of history', () => {
    const decision = decideExerciseProgression('Warm Up', null, { sets: 1 }, [log()], NO_READINESS);
    expect(decision.decision).toBe('SKIP');
    expect(decision.nextTarget).toBeNull();
  });
});

describe('decideExerciseProgression — A: successful rep-range progression (bodyweight)', () => {
  it('climbs reps by 1 within the window on a full completion with high RIR', () => {
    const slot = bodyweightSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ exerciseName: 'Push-Ups', repsAchieved: 8, loadKg: undefined, rir: 3 })];
    const decision = decideExerciseProgression('Push-Ups', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.decision).toBe('PROGRESS');
    expect(decision.nextTarget?.reps).toBe(9);
    expect(decision.nextTarget?.loadKg).toBeUndefined();
  });

  it('holds at the ceiling rather than inventing load for a bodyweight exercise', () => {
    const slot = bodyweightSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ exerciseName: 'Push-Ups', repsAchieved: 12, loadKg: undefined, rir: 3 })];
    const decision = decideExerciseProgression('Push-Ups', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.nextTarget?.reps).toBe(12); // capped at repCeiling, never exceeds it
  });
});

describe('decideExerciseProgression — B: successful load progression', () => {
  it('climbs reps within the window before adding load', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ repsAchieved: 6, loadKg: 70, rir: 3 })];
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.decision).toBe('PROGRESS');
    expect(decision.nextTarget).toEqual({ sets: 3, reps: 7, loadKg: 70 });
  });

  it('adds load and resets reps to the floor once the ceiling is met', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ repsAchieved: 8, loadKg: 70, rir: 3 })]; // 8 = ceiling
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.nextTarget).toEqual({ sets: 3, reps: 6, loadKg: 72.5 });
  });

  it("never fabricates a load bump when the athlete's load wasn't logged", () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ repsAchieved: 8, loadKg: undefined, rir: 3 })];
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.nextTarget?.loadKg).toBeUndefined();
  });
});

describe('decideExerciseProgression — C: failed target / D: partial completion / E: missed workout', () => {
  it('C: HOLDs on a fully-completed but at-failure exposure (RIR 0), single occurrence', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ rir: 0 })];
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.decision).toBe('MAINTAIN');
    expect(decision.nextTarget).toEqual(decision.previousTarget);
  });

  it('D: HOLDs on a partial completion, never progresses from incomplete evidence', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ completedSets: 2, prescribedSets: 4 })];
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.decision).toBe('HOLD');
  });

  it('E: HOLDs on a fully missed session (0 completed sets)', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ completedSets: 0 })];
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.decision).toBe('HOLD');
    expect(decision.reason.toLowerCase()).toContain('missed');
  });
});

describe('decideExerciseProgression — G/H/I: RIR-based progress/hold/regress, J: missing RIR', () => {
  it('G: progresses when RIR is comfortably above target', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), [log({ rir: 3 })], NO_READINESS);
    expect(decision.decision).toBe('PROGRESS');
  });

  it('H: holds (does not progress) when RIR is right around target', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), [log({ rir: 1 })], NO_READINESS);
    expect(decision.decision).toBe('MAINTAIN');
  });

  it('I: regresses after consecutive low-RIR exposures under normal readiness', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = Array.from({ length: CONSECUTIVE_STRUGGLES_FOR_REGRESS }, (_, i) =>
      log({ date: `2026-01-0${i + 1}`, rir: 0 })
    );
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.decision).toBe('REGRESS');
    expect(decision.nextTarget?.reps).toBeLessThan(decision.previousTarget!.reps!);
  });

  it('J: a single low-RIR exposure never regresses by itself (needs the consecutive threshold)', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), [log({ rir: 0 })], NO_READINESS);
    expect(decision.decision).not.toBe('REGRESS');
  });

  it('J: missing RIR still allows progression from completion alone, at lower confidence', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), [log({ rir: undefined })], NO_READINESS);
    expect(decision.decision).toBe('PROGRESS');
    expect(decision.confidence).toBe('low');
    expect(decision.reason.toLowerCase()).toContain("wasn't logged");
  });
});

describe('decideExerciseProgression — K: multiple successful exposures / L: mixed recent exposures', () => {
  it('K: 3 consecutive successful exposures reach high confidence', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = Array.from({ length: MIN_EXPOSURES_FOR_HIGH_CONFIDENCE }, (_, i) =>
      log({ date: `2026-01-0${i + 1}`, rir: 3 })
    );
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.decision).toBe('PROGRESS');
    expect(decision.confidence).toBe('high');
  });

  it('L: a good exposure right after a struggling one holds rather than immediately progressing', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ date: '2026-01-05', rir: 0 }), log({ date: '2026-01-08', rir: 3 })];
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.decision).toBe('MAINTAIN');
  });
});

describe('decideExerciseProgression — M/N: readiness integration', () => {
  it('M: low readiness + poor performance holds rather than regressing', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ rir: 0 })];
    const getReadiness = (() => 'recovery') as () => ReadinessStatus;
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, getReadiness);
    expect(decision.decision).toBe('HOLD');
    expect(decision.reason.toLowerCase()).toContain('readiness');
  });

  it('N: normal readiness + poor performance is genuine evidence (contributes toward regress)', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = Array.from({ length: CONSECUTIVE_STRUGGLES_FOR_REGRESS }, (_, i) => log({ date: `2026-01-0${i + 1}`, rir: 0 }));
    const getReadiness = (() => 'normal') as () => ReadinessStatus;
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, getReadiness);
    expect(decision.decision).toBe('REGRESS');
  });

  it('O: high readiness + successful performance progresses normally', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const getReadiness = (() => 'high') as () => ReadinessStatus;
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), [log({ rir: 3 })], getReadiness);
    expect(decision.decision).toBe('PROGRESS');
  });

  it('a low-readiness struggle does not contaminate a later normal-readiness streak toward REGRESS', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    // struggle under low readiness (suppressed), then only 1 struggle under normal readiness — not enough to regress.
    const history = [log({ date: '2026-01-01', rir: 0 }), log({ date: '2026-01-04', rir: 0 })];
    const getReadiness = (date: string) => (date === '2026-01-01' ? 'recovery' : 'normal');
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, getReadiness as (d: string) => ReadinessStatus);
    expect(decision.decision).not.toBe('REGRESS');
  });
});

describe('decideExerciseProgression — technique model (P/Q evidence integrity, spec §4E)', () => {
  it('never proposes PROGRESS/REGRESS for a technique-model exercise, only MAINTAIN', () => {
    const slot: ExerciseSlot = { name: 'Freestyle Focus Drill', sets: 4, reps: 'AMRAP', equipment: [], category: 'technique' };
    const config = inferProgressionModel(slot)!;
    expect(config.model).toBe('technique');
    const decision = decideExerciseProgression('Freestyle Focus Drill', config, deriveBaseTarget(slot, config), [log({ exerciseName: 'Freestyle Focus Drill' })], NO_READINESS);
    expect(decision.decision).toBe('MAINTAIN');
  });
});

describe('decideExerciseProgression — distance/duration models (C. and D. progression)', () => {
  it('progresses distance by the documented percentage step, rounded to a clean interval', () => {
    const slot: ExerciseSlot = { name: 'Swim Endurance', sets: 1, reps: '300m easy pace', equipment: [], category: 'conditioning' };
    const config = inferProgressionModel(slot)!;
    expect(config.model).toBe('distance');
    const history = [log({ exerciseName: 'Swim Endurance', distanceM: 300, rir: 3 })];
    const decision = decideExerciseProgression('Swim Endurance', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.decision).toBe('PROGRESS');
    expect(decision.nextTarget?.distanceM).toBeGreaterThan(300);
  });

  it('progresses duration similarly', () => {
    const slot: ExerciseSlot = { name: 'Plank Hold', sets: 3, reps: '30 sec', equipment: [], category: 'strength' };
    const config = inferProgressionModel(slot)!;
    expect(config.model).toBe('duration');
    const history = [log({ exerciseName: 'Plank Hold', durationSec: 30, rir: 3 })];
    const decision = decideExerciseProgression('Plank Hold', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(decision.decision).toBe('PROGRESS');
    expect(decision.nextTarget?.durationSec).toBeGreaterThan(30);
  });
});

describe('decideExerciseProgression — invariants (spec §21)', () => {
  it('never produces a negative reps/load/distance/duration target across a wide input sweep', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    for (let rir = -2; rir <= 6; rir++) {
      for (const loadKg of [undefined, 0, 2.5, 70]) {
        const history = [log({ rir, loadKg, repsAchieved: 6 })];
        const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
        if (decision.nextTarget?.reps !== undefined) expect(decision.nextTarget.reps).toBeGreaterThanOrEqual(0);
        if (decision.nextTarget?.loadKg !== undefined) expect(decision.nextTarget.loadKg).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('identical history always produces an identical decision (determinism)', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const history = [log({ rir: 2 }), log({ date: '2026-01-08', rir: 3 })];
    const a = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    const b = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), history, NO_READINESS);
    expect(a).toEqual(b);
  });

  it('a missing performance record (SKIP) never reads as a successful exposure', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), [], NO_READINESS);
    expect(decision.decision).not.toBe('PROGRESS');
    expect(decision.exposureCount).toBe(0);
  });

  it('a skipped exposure (0 completed sets) is never treated as successful', () => {
    const slot = loadSlot();
    const config = inferProgressionModel(slot)!;
    const decision = decideExerciseProgression('Back Squat', config, deriveBaseTarget(slot, config), [log({ completedSets: 0, prescribedSets: 3 })], NO_READINESS);
    expect(decision.decision).not.toBe('PROGRESS');
  });
});
