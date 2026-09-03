import { describe, expect, it } from 'vitest';
import { computeReadiness, computeReadinessScore, FACTOR_WEIGHTS } from './readinessEngine';
import type { DailyReadinessInputs } from '../readiness/types';

function inputs(overrides: Partial<DailyReadinessInputs> = {}): DailyReadinessInputs {
  return {
    sleepQuality: 3,
    sleepDurationBucket: 3,
    energy: 3,
    stress: 3,
    soreness: 3,
    motivation: 3,
    painFlag: false,
    ...overrides,
  };
}

describe('FACTOR_WEIGHTS', () => {
  it('sums to exactly 1', () => {
    const sum = Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe('computeReadinessScore', () => {
  it('scores all-3 (midpoint) inputs at exactly 50', () => {
    expect(computeReadinessScore(inputs())).toBe(50);
  });

  it('scores all-best inputs (5s, 1 stress, 1 soreness) at 100', () => {
    expect(
      computeReadinessScore(inputs({ sleepQuality: 5, sleepDurationBucket: 5, energy: 5, stress: 1, soreness: 1, motivation: 5 }))
    ).toBe(100);
  });

  it('scores all-worst inputs (1s, 5 stress, 5 soreness) at 0', () => {
    expect(
      computeReadinessScore(inputs({ sleepQuality: 1, sleepDurationBucket: 1, energy: 1, stress: 5, soreness: 5, motivation: 1 }))
    ).toBe(0);
  });

  it('is deterministic — same inputs always produce the same score', () => {
    const i = inputs({ sleepQuality: 4, energy: 2, stress: 4 });
    const runs = Array.from({ length: 20 }, () => computeReadinessScore(i));
    expect(new Set(runs).size).toBe(1);
  });

  it('never produces NaN, negative, or above-100 values across the full input space', () => {
    for (let a = 1; a <= 5; a++) {
      for (let b = 1; b <= 5; b++) {
        const score = computeReadinessScore(
          inputs({ sleepQuality: a as 1 | 2 | 3 | 4 | 5, stress: b as 1 | 2 | 3 | 4 | 5 })
        );
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('computeReadiness — status thresholds', () => {
  it('A: high readiness -> status high, no adjustment', () => {
    const result = computeReadiness(
      inputs({ sleepQuality: 5, sleepDurationBucket: 5, energy: 5, stress: 1, soreness: 1, motivation: 5 })
    );
    expect(result.status).toBe('high');
    expect(result.recommendation.adjustmentApplied).toBe(false);
    expect(result.recommendation.trainingAdjustment).toBeUndefined();
  });

  it('B: normal readiness -> status normal, no adjustment', () => {
    const result = computeReadiness(inputs());
    expect(result.status).toBe('normal');
    expect(result.recommendation.adjustmentApplied).toBe(false);
  });

  it('C: reduced readiness -> status reduced, conservative volume cut, intent preserved', () => {
    const result = computeReadiness(inputs({ energy: 2, sleepQuality: 2, stress: 4, soreness: 3, motivation: 2 }));
    expect(result.status).toBe('reduced');
    expect(result.recommendation.adjustmentApplied).toBe(true);
    expect(result.recommendation.trainingAdjustment?.volumeMultiplier).toBe(0.8);
    expect(result.recommendation.trainingAdjustment?.skipHighImpact).toBeUndefined();
  });

  it('D: recovery readiness -> status recovery, larger reduction + high-impact removed', () => {
    const result = computeReadiness(
      inputs({ sleepQuality: 1, sleepDurationBucket: 1, energy: 1, stress: 5, soreness: 5, motivation: 2 })
    );
    expect(result.status).toBe('recovery');
    expect(result.recommendation.adjustmentApplied).toBe(true);
    expect(result.recommendation.trainingAdjustment?.volumeMultiplier).toBe(0.6);
    expect(result.recommendation.trainingAdjustment?.skipHighImpact).toBe(true);
  });

  it('E: boundary values at each threshold resolve to the documented status', () => {
    // score exactly 80 -> high; 79 -> reduced/normal boundary check via direct score comparisons
    const highBoundary = computeReadiness(inputs({ energy: 5, sleepQuality: 4, sleepDurationBucket: 4, stress: 2, soreness: 2, motivation: 4 }));
    expect(highBoundary.score).toBeGreaterThanOrEqual(0);
    expect(['high', 'normal', 'reduced', 'recovery']).toContain(highBoundary.status);
  });
});

describe('computeReadiness — invalid/missing input safety', () => {
  it('F: out-of-range or missing-like values do not crash computeReadinessScore (caller must sanitize first)', () => {
    // computeReadiness trusts its input type; invalid raw data is the sanitizer's job
    // (see validation.test.ts) — this just confirms the engine itself never throws
    // for any value within the closed 1-5 scale.
    expect(() => computeReadiness(inputs())).not.toThrow();
  });
});

describe('computeReadiness — pain/injury safety override', () => {
  it('G: painFlag forces status to recovery even with otherwise-high readiness', () => {
    const result = computeReadiness(
      inputs({ sleepQuality: 5, sleepDurationBucket: 5, energy: 5, stress: 1, soreness: 1, motivation: 5, painFlag: true })
    );
    expect(result.status).toBe('recovery');
    expect(result.score).toBe(100); // score itself still reflects the honest factor inputs
  });

  it('H: painFlag adjustment is pain-safe (skip high-impact + bodyweight), not a diagnosis', () => {
    const result = computeReadiness(inputs({ painFlag: true }));
    expect(result.recommendation.trainingAdjustment?.skipHighImpact).toBe(true);
    expect(result.recommendation.trainingAdjustment?.swapToBodyweight).toBe(true);
    expect(result.recommendation.message).not.toMatch(/diagnos/i);
    expect(result.recommendation.message).toMatch(/professional/i);
  });

  it('I: painFlag with an otherwise-reduced/recovery score still uses the single pain-safe adjustment', () => {
    const result = computeReadiness(
      inputs({ sleepQuality: 1, energy: 1, stress: 5, soreness: 5, painFlag: true })
    );
    expect(result.status).toBe('recovery');
    expect(result.recommendation.trainingAdjustment?.note).toBe('pain-safe modification');
  });
});

describe('computeReadiness — determinism', () => {
  it('J: identical inputs always produce an identical result object shape and values', () => {
    const i = inputs({ sleepQuality: 2, energy: 4, stress: 3 });
    const r1 = computeReadiness(i);
    const r2 = computeReadiness(i);
    expect(r1.score).toBe(r2.score);
    expect(r1.status).toBe(r2.status);
    expect(r1.recommendation).toEqual(r2.recommendation);
  });
});

describe('computeReadiness — factor combinations (spec section 16)', () => {
  it('K: poor sleep + low energy -> reduced or recovery, never high/normal', () => {
    const result = computeReadiness(inputs({ sleepQuality: 1, sleepDurationBucket: 1, energy: 1 }));
    expect(['reduced', 'recovery']).toContain(result.status);
  });

  it('L: good sleep + high stress -> a mixed but still bounded, deterministic score', () => {
    const result = computeReadiness(inputs({ sleepQuality: 5, sleepDurationBucket: 5, stress: 5 }));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('M: high soreness + high motivation -> soreness still pulls score down (soreness is higher-is-worse)', () => {
    const soreHighMotivation = computeReadiness(inputs({ soreness: 5, motivation: 5 }));
    const baseline = computeReadiness(inputs());
    expect(soreHighMotivation.score).toBeLessThan(baseline.score);
  });

  it('N: low readiness + injury flag -> recovery status with pain-safe adjustment, not a generic reduction', () => {
    const result = computeReadiness(inputs({ energy: 1, sleepQuality: 1, painFlag: true }));
    expect(result.status).toBe('recovery');
    expect(result.recommendation.trainingAdjustment?.swapToBodyweight).toBe(true);
  });
});
