import { describe, expect, it } from 'vitest';
import { buildNutritionProgress } from './nutritionProgress';
import type { DayLog } from '../state/LogContext';
import type { NutritionLogEntry } from '../nutrition/types';

function nutritionEntry(overrides: Partial<NutritionLogEntry>): NutritionLogEntry {
  return {
    date: '2026-01-01',
    slotId: 'breakfast',
    foodId: 'oats',
    quantity: 1,
    calories: 500,
    proteinG: 30,
    carbsG: 60,
    fatG: 10,
    wasModified: false,
    submittedAt: '2026-01-01T08:00:00.000Z',
    ...overrides,
  };
}

function day(date: string, nutritionLogs: NutritionLogEntry[] = [], loggedMealSlots: DayLog['loggedMealSlots'] = []): DayLog {
  return { date, loggedMealSlots, mealOverrides: {}, workoutCompleted: false, nutritionLogs };
}

const TARGETS = { calories: 2000, proteinG: 150 };

describe('buildNutritionProgress', () => {
  it('U/insufficient data: no logging never shows a fabricated 0%', () => {
    const week = Array.from({ length: 7 }, (_, i) => day(`2026-01-0${i + 1}`));
    const result = buildNutritionProgress(week, week, TARGETS);
    expect(result.hasDetailedData).toBe(false);
    expect(result.caloriesAdherencePct).toBeNull();
  });

  it('U: sufficient logging produces real adherence percentages', () => {
    const week = [
      day('2026-01-01', [nutritionEntry({ date: '2026-01-01', calories: 1000 }), nutritionEntry({ date: '2026-01-01', calories: 900 })]),
      day('2026-01-02', [nutritionEntry({ date: '2026-01-02', calories: 950 }), nutritionEntry({ date: '2026-01-02', calories: 1000 })]),
    ];
    const result = buildNutritionProgress(week, [], TARGETS);
    expect(result.hasDetailedData).toBe(true);
    expect(result.caloriesAdherencePct).not.toBeNull();
  });

  it('U: week-over-week trend is insufficient_data unless BOTH weeks have detailed logs', () => {
    const withLogs = [
      day('2026-01-08', [nutritionEntry({ date: '2026-01-08', calories: 1000 })]),
      day('2026-01-09', [nutritionEntry({ date: '2026-01-09', calories: 1000 })]),
    ];
    const withoutLogs = Array.from({ length: 7 }, (_, i) => day(`2026-01-0${i + 1}`));
    const result = buildNutritionProgress(withLogs, withoutLogs, TARGETS);
    expect(result.trend.state).toBe('insufficient_data');
  });

  it('Z: determinism', () => {
    const week = [
      day('2026-01-01', [nutritionEntry({ date: '2026-01-01', calories: 1000 })]),
      day('2026-01-02', [nutritionEntry({ date: '2026-01-02', calories: 1000 })]),
    ];
    const a = buildNutritionProgress(week, [], TARGETS);
    const b = buildNutritionProgress([...week], [], TARGETS);
    expect(a).toEqual(b);
  });
});
