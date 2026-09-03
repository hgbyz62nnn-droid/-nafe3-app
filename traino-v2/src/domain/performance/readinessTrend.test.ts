import { describe, expect, it } from 'vitest';
import { buildReadinessTrend } from './readinessTrend';
import type { DailyReadinessInputs, DailyReadinessRecord } from '../readiness/types';

function inputs(overrides: Partial<DailyReadinessInputs> = {}): DailyReadinessInputs {
  return { sleepQuality: 3, sleepDurationBucket: 3, energy: 3, stress: 3, soreness: 3, motivation: 3, painFlag: false, ...overrides };
}

function record(date: string, score: number, status: DailyReadinessRecord['status'], overrides: Partial<DailyReadinessInputs> = {}): DailyReadinessRecord {
  return {
    date,
    inputs: inputs(overrides),
    score,
    status,
    recommendation: { message: 'ok', adjustmentApplied: false },
    recommendationApplied: false,
    submittedAt: `${date}T08:00:00.000Z`,
  };
}

describe('buildReadinessTrend', () => {
  it('A: no records -> honest no-data state', () => {
    const result = buildReadinessTrend([]);
    expect(result.hasData).toBe(false);
    expect(result.averageScore).toBeNull();
    expect(result.scoreTrend.state).toBe('insufficient_data');
  });

  it('T: average score and low-readiness day count are real', () => {
    const records = [record('2026-01-01', 80, 'high'), record('2026-01-02', 40, 'reduced'), record('2026-01-03', 35, 'recovery')];
    const result = buildReadinessTrend(records);
    expect(result.checkInsCount).toBe(3);
    expect(result.averageScore).toBe(Math.round((80 + 40 + 35) / 3));
    expect(result.lowReadinessDaysCount).toBe(2);
  });

  it('T: stress/soreness trends are flipped — a decreasing value is "improving"', () => {
    const records = [
      record('2026-01-01', 70, 'normal', { stress: 5, soreness: 5 }),
      record('2026-01-02', 70, 'normal', { stress: 4, soreness: 4 }),
      record('2026-01-03', 70, 'normal', { stress: 2, soreness: 2 }),
      record('2026-01-04', 70, 'normal', { stress: 1, soreness: 1 }),
    ];
    const result = buildReadinessTrend(records);
    expect(result.stressTrend.state).toBe('improving');
    expect(result.sorenessTrend.state).toBe('improving');
  });

  it('T: energy/score trends use plain higher-is-better direction', () => {
    const records = [
      record('2026-01-01', 50, 'reduced', { energy: 2 }),
      record('2026-01-02', 60, 'normal', { energy: 3 }),
      record('2026-01-03', 70, 'normal', { energy: 4 }),
      record('2026-01-04', 80, 'high', { energy: 5 }),
    ];
    const result = buildReadinessTrend(records);
    expect(result.scoreTrend.state).toBe('improving');
    expect(result.energyTrend.state).toBe('improving');
  });

  it('Z: determinism', () => {
    const records = [record('2026-01-01', 80, 'high'), record('2026-01-02', 40, 'reduced')];
    expect(buildReadinessTrend(records)).toEqual(buildReadinessTrend([...records]));
  });
});
