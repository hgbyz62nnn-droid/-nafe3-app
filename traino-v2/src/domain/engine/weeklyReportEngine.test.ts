import { describe, expect, it } from 'vitest';
import { generateWeeklyReport, type WeekLog } from './weeklyReportEngine';

function weekLog(overrides: Partial<WeekLog> = {}): WeekLog {
  return {
    workoutsCompleted: 3,
    workoutsPlanned: 3,
    nutritionAdherencePct: 80,
    recoveryAveragePct: 75,
    weightDeltaKg: -0.5,
    weakestArea: 'nutrition',
    strongestArea: 'strength',
    ...overrides,
  };
}

describe('generateWeeklyReport — weekly report calculations', () => {
  it('gives the top headline for a fully completed week', () => {
    const report = generateWeeklyReport(weekLog({ workoutsCompleted: 5, workoutsPlanned: 5 }));
    expect(report.headline).toBe('Great work this week!');
  });

  it('gives an encouraging-but-honest headline for a low-completion week', () => {
    const report = generateWeeklyReport(weekLog({ workoutsCompleted: 1, workoutsPlanned: 5 }));
    expect(report.headline).toBe("Let's build momentum next week");
  });

  it('handles a week with zero planned workouts without dividing by zero', () => {
    const report = generateWeeklyReport(weekLog({ workoutsCompleted: 0, workoutsPlanned: 0 }));
    expect(report.headline).toBe("Let's build momentum next week");
    expect(Number.isNaN(report.workoutsCompleted)).toBe(false);
  });

  it('labels recovery from the fixed threshold table', () => {
    expect(generateWeeklyReport(weekLog({ recoveryAveragePct: 90 })).recoveryLabel).toBe('Excellent');
    expect(generateWeeklyReport(weekLog({ recoveryAveragePct: 72 })).recoveryLabel).toBe('Good');
    expect(generateWeeklyReport(weekLog({ recoveryAveragePct: 55 })).recoveryLabel).toBe('Fair');
    expect(generateWeeklyReport(weekLog({ recoveryAveragePct: 20 })).recoveryLabel).toBe('Needs attention');
  });

  it('praises the strongest area and flags the weakest when they differ', () => {
    const report = generateWeeklyReport(weekLog({ strongestArea: 'speed', weakestArea: 'recovery' }));
    expect(report.coachFeedback).toContain('speed work');
    expect(report.coachFeedback).toContain('sleep and recovery');
  });

  it('gives single consistent praise when the strongest and weakest area are the same', () => {
    const report = generateWeeklyReport(weekLog({ strongestArea: 'none', weakestArea: 'none' }));
    expect(report.coachFeedback).toBe('You stayed consistent. Let\'s keep building on that next week.');
  });

  it('passes through the raw numeric fields unchanged', () => {
    const log = weekLog({ workoutsCompleted: 4, workoutsPlanned: 6, nutritionAdherencePct: 63, weightDeltaKg: 1.2 });
    const report = generateWeeklyReport(log);
    expect(report.workoutsCompleted).toBe(4);
    expect(report.workoutsPlanned).toBe(6);
    expect(report.nutritionAdherencePct).toBe(63);
    expect(report.weightDeltaKg).toBe(1.2);
  });
});
