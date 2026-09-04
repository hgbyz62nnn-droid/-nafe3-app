import { describe, expect, it } from 'vitest';
import { deriveBaseTarget, inferProgressionModel, parseDistanceMeters, parseDurationSeconds } from './progressionModels';
import type { ExerciseSlot } from './types';

function slot(overrides: Partial<ExerciseSlot>): ExerciseSlot {
  return { name: 'Test', sets: 3, reps: '8-10', equipment: [], category: 'strength', ...overrides };
}

describe('inferProgressionModel', () => {
  it('never progresses warmup/cooldown', () => {
    expect(inferProgressionModel(slot({ category: 'warmup', reps: '8 min' }))).toBeNull();
    expect(inferProgressionModel(slot({ category: 'cooldown', reps: '6 min' }))).toBeNull();
  });

  it('infers distance model from a meters-suffixed reps string, any category', () => {
    expect(inferProgressionModel(slot({ reps: '25m', category: 'technique' }))?.model).toBe('distance');
    expect(inferProgressionModel(slot({ reps: '300m easy pace', category: 'conditioning' }))?.model).toBe('distance');
    expect(inferProgressionModel(slot({ reps: '50m @ 1:00', category: 'conditioning' }))?.model).toBe('distance');
  });

  it('infers duration model from sec/min-suffixed reps string', () => {
    expect(inferProgressionModel(slot({ reps: '15 sec', category: 'conditioning' }))?.model).toBe('duration');
    expect(inferProgressionModel(slot({ reps: '30 sec / side', category: 'strength' }))?.model).toBe('duration');
  });

  it('infers load model for equipment-based strength/power with numeric reps', () => {
    const config = inferProgressionModel(slot({ reps: '6-8', category: 'strength', equipment: ['barbell'] }));
    expect(config?.model).toBe('load');
    expect(config?.repFloor).toBe(6);
    expect(config?.repCeiling).toBe(8);
    expect(config?.loadIncrementKg).toBeGreaterThan(0);
  });

  it('infers rep_range model for bodyweight strength/power with numeric reps', () => {
    const config = inferProgressionModel(slot({ reps: '10', category: 'strength', equipment: [] }));
    expect(config?.model).toBe('rep_range');
    expect(config?.repFloor).toBe(10);
    expect(config?.repCeiling).toBe(10);
  });

  it('infers rep_range (never load) for a numeric-reps technique or conditioning slot', () => {
    expect(inferProgressionModel(slot({ reps: '20 reps', category: 'technique', equipment: [] }))?.model).toBe('rep_range');
    expect(inferProgressionModel(slot({ reps: '15', category: 'conditioning', equipment: ['barbell'] }))?.model).toBe('rep_range');
  });

  it('falls back to technique model for an unparseable reps string', () => {
    expect(inferProgressionModel(slot({ reps: 'AMRAP', category: 'technique' }))?.model).toBe('technique');
  });

  it('is deterministic and sport-agnostic — identical slot shape always infers identically', () => {
    const a = inferProgressionModel(slot({ reps: '8-12', category: 'strength', equipment: ['dumbbells'] }));
    const b = inferProgressionModel(slot({ reps: '8-12', category: 'strength', equipment: ['dumbbells'] }));
    expect(a).toEqual(b);
  });
});

describe('inferProgressionModel — preferredModel is exercise identity, not performed context', () => {
  // Regression coverage for the equipment-constrained progression-model bug: a resolved
  // exercise's canonical `preferredModel` (from the Exercise Library) describes what that
  // NAMED movement generally supports, not what's valid for THIS resolution. Expressed
  // generically via `slot.equipment` only — never an exercise name or sport check.

  it('never trusts a load preferredModel when the resolved slot carries zero equipment', () => {
    const config = inferProgressionModel(slot({ reps: '10 / side', category: 'strength', equipment: [] }), 'load');
    expect(config?.model).not.toBe('load');
    // Falls through to the reps-string classification — a parseable numeric rep count
    // with no equipment lands on rep_range, exactly as if no preferredModel were given.
    expect(config?.model).toBe('rep_range');
  });

  it('still trusts a load preferredModel when the resolved slot has real equipment — normal case unaffected', () => {
    const config = inferProgressionModel(slot({ reps: '6-8', category: 'strength', equipment: ['barbell'] }), 'load');
    expect(config?.model).toBe('load');
    expect(config?.repFloor).toBe(6);
    expect(config?.repCeiling).toBe(8);
  });

  it('passes through every non-load preferredModel unchanged, even with zero equipment', () => {
    expect(inferProgressionModel(slot({ reps: '300m', category: 'conditioning', equipment: [] }), 'distance')?.model).toBe('distance');
    expect(inferProgressionModel(slot({ reps: '30 sec', category: 'conditioning', equipment: [] }), 'duration')?.model).toBe('duration');
    expect(inferProgressionModel(slot({ reps: '8', category: 'strength', equipment: [] }), 'technique')?.model).toBe('technique');
    expect(inferProgressionModel(slot({ reps: '8', category: 'strength', equipment: [] }), 'rep_range')?.model).toBe('rep_range');
  });

  it('a bodyweight-resolved rep count still yields correct numeric bounds after the load->rep_range fallback', () => {
    const config = inferProgressionModel(slot({ reps: '12 / leg', category: 'strength', equipment: [] }), 'load');
    expect(config?.model).toBe('rep_range');
    expect(config?.repFloor).toBe(12);
    expect(config?.repCeiling).toBe(12);
  });
});

describe('parseDistanceMeters / parseDurationSeconds', () => {
  it('parses distance leading digits, ignoring trailing pace annotation', () => {
    expect(parseDistanceMeters('300m easy pace')).toBe(300);
    expect(parseDistanceMeters('50m @ 1:00')).toBe(50);
  });

  it('parses duration, converting minutes to seconds', () => {
    expect(parseDurationSeconds('15 sec')).toBe(15);
    expect(parseDurationSeconds('8 min')).toBe(480);
  });

  it('returns null rather than a fabricated value for unparseable input', () => {
    expect(parseDistanceMeters('8-10')).toBeNull();
    expect(parseDurationSeconds('8-10')).toBeNull();
  });
});

describe('deriveBaseTarget', () => {
  it('never fabricates a load — a load-model exercise starts with loadKg undefined', () => {
    const config = inferProgressionModel(slot({ reps: '6-8', category: 'strength', equipment: ['barbell'] }))!;
    const target = deriveBaseTarget(slot({ reps: '6-8', category: 'strength', equipment: ['barbell'], sets: 4 }), config);
    expect(target.sets).toBe(4);
    expect(target.reps).toBe(6);
    expect(target.loadKg).toBeUndefined();
  });

  it('returns just sets for a null config (warmup/cooldown)', () => {
    expect(deriveBaseTarget(slot({ category: 'warmup', reps: '8 min', sets: 1 }), null)).toEqual({ sets: 1 });
  });
});
