import { describe, expect, it } from 'vitest';
import { buildWeightTrend, interpretWeightGoalAlignment } from './weightTrend';
import type { DayLog } from '../state/LogContext';

function day(date: string, weightKg?: number): DayLog {
  return { date, loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false, weightKg };
}

describe('buildWeightTrend', () => {
  it('A: no weigh-ins -> honest insufficient_data, never a fabricated trend', () => {
    const logs = [day('2026-01-01'), day('2026-01-02')];
    const result = buildWeightTrend('fat_loss', logs, 80);
    expect(result.hasData).toBe(false);
    expect(result.trend.state).toBe('insufficient_data');
    expect(result.goalAlignment).toBe('insufficient_data');
  });

  it('B: a single weigh-in is not a meaningful trend', () => {
    const logs = [day('2026-01-01', 80)];
    const result = buildWeightTrend('fat_loss', logs, 80);
    expect(result.trend.state).toBe('insufficient_data');
  });

  it('V: fat_loss goal — a downward trend is aligned', () => {
    const logs = [day('2026-01-01', 82), day('2026-01-08', 81), day('2026-01-15', 80), day('2026-01-22', 79)];
    const result = buildWeightTrend('fat_loss', logs, 80);
    expect(result.trend.state).toBe('declining');
    expect(result.goalAlignment).toBe('aligned');
  });

  it('V: fat_loss goal — an upward trend is diverging (never a medical claim)', () => {
    const logs = [day('2026-01-01', 78), day('2026-01-08', 79), day('2026-01-15', 80), day('2026-01-22', 81)];
    const result = buildWeightTrend('fat_loss', logs, 78);
    expect(result.goalAlignment).toBe('diverging');
  });

  it('V: muscle_gain goal — an upward trend is aligned', () => {
    const logs = [day('2026-01-01', 78), day('2026-01-08', 79), day('2026-01-15', 80), day('2026-01-22', 81)];
    const result = buildWeightTrend('muscle_gain', logs, 78);
    expect(result.goalAlignment).toBe('aligned');
  });

  it('V: general_fitness (maintenance) — a stable trend is aligned', () => {
    const logs = [day('2026-01-01', 80), day('2026-01-08', 80), day('2026-01-15', 80.1), day('2026-01-22', 80)];
    const result = buildWeightTrend('general_fitness', logs, 80);
    expect(result.trend.state).toBe('stable');
    expect(result.goalAlignment).toBe('stable_as_expected');
  });

  it('V: performance goal never forces a weight direction', () => {
    const upLogs = [day('2026-01-01', 78), day('2026-01-08', 79), day('2026-01-15', 80), day('2026-01-22', 81)];
    const downLogs = [day('2026-01-01', 82), day('2026-01-08', 81), day('2026-01-15', 80), day('2026-01-22', 79)];
    expect(buildWeightTrend('performance', upLogs, 78).goalAlignment).toBe('not_applicable');
    expect(buildWeightTrend('performance', downLogs, 82).goalAlignment).toBe('not_applicable');
  });

  it('interpretWeightGoalAlignment never throws for any goal x trend state combination', () => {
    const goals = ['fat_loss', 'muscle_gain', 'general_fitness', 'recovery', 'performance'] as const;
    const states = ['improving', 'stable', 'declining', 'insufficient_data'] as const;
    for (const goal of goals) {
      for (const state of states) {
        expect(() => interpretWeightGoalAlignment(goal, { state, confidence: 'sufficient', sampleSize: 4 })).not.toThrow();
      }
    }
  });

  it('Z: determinism', () => {
    const logs = [day('2026-01-01', 80), day('2026-01-08', 79)];
    const a = buildWeightTrend('fat_loss', logs, 80);
    const b = buildWeightTrend('fat_loss', [...logs], 80);
    expect(a).toEqual(b);
  });
});
