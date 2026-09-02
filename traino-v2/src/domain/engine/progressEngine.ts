import type { DayLog } from '../state/LogContext';

/**
 * Derives Progress-screen stats from real logged history (LogContext) —
 * no fabricated numbers. With little or no history yet, stats come back
 * honestly flat/zero rather than pretending to have data.
 */

export type PerformanceCategory = 'speed' | 'strength' | 'stamina';

/** Buckets a completed workout's name into one of the three Progress
 * categories by keyword — football's day-template names all match one
 * of these; anything else (e.g. the generic "Full Body A/B/C" fallback
 * program) defaults to 'strength' since full-body sessions are
 * strength-dominant. */
export function deriveStatCategory(workoutName: string): PerformanceCategory {
  const name = workoutName.toLowerCase();
  if (name.includes('speed') || name.includes('sprint')) return 'speed';
  if (name.includes('agility') || name.includes('conditioning')) return 'stamina';
  return 'strength';
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

export interface PerformanceStatResult {
  changePct: number;
  trend: number[];
  hasData: boolean;
}

export function computePerformanceStats(recentLogs: DayLog[]): Record<PerformanceCategory, PerformanceStatResult> {
  const completedByCategory: Record<PerformanceCategory, DayLog[]> = { speed: [], strength: [], stamina: [] };
  for (const day of recentLogs) {
    if (day.workoutCompleted && day.workoutName) {
      completedByCategory[deriveStatCategory(day.workoutName)].push(day);
    }
  }

  const result = {} as Record<PerformanceCategory, PerformanceStatResult>;
  for (const category of ['speed', 'strength', 'stamina'] as PerformanceCategory[]) {
    const days = completedByCategory[category];
    if (days.length === 0) {
      result[category] = { changePct: 0, trend: [0, 0], hasData: false };
      continue;
    }

    const byWeek = new Map<string, number>();
    for (const day of days) {
      const week = isoWeekKey(day.date);
      byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
    }
    const trend = Array.from(byWeek.values());
    const first = trend[0];
    const last = trend[trend.length - 1];
    const changePct = first > 0 ? Math.round(((last - first) / first) * 100) : last > 0 ? 100 : 0;

    result[category] = { changePct, trend: trend.length > 1 ? trend : [trend[0], trend[0]], hasData: true };
  }
  return result;
}

export interface WeightTrendResult {
  points: number[];
  hasData: boolean;
  deltaKg: number;
}

export function computeWeightTrend(recentLogs: DayLog[], fallbackWeightKg: number): WeightTrendResult {
  const entries = recentLogs.filter((d): d is DayLog & { weightKg: number } => typeof d.weightKg === 'number');
  if (entries.length === 0) {
    return { points: [fallbackWeightKg, fallbackWeightKg], hasData: false, deltaKg: 0 };
  }
  const points = entries.map((e) => e.weightKg);
  const delta = Math.round((points[points.length - 1] - points[0]) * 10) / 10;
  return { points: points.length > 1 ? points : [points[0], points[0]], hasData: true, deltaKg: delta };
}

export function computeWorkoutCompletion(recentLogs: DayLog[]): { completed: number; planned: number } {
  const completed = recentLogs.filter((d) => d.workoutCompleted).length;
  return { completed, planned: recentLogs.length };
}

export function computeNutritionAdherence(recentLogs: DayLog[]): number {
  const totalSlots = recentLogs.length * 4;
  if (totalSlots === 0) return 0;
  const loggedSlots = recentLogs.reduce((sum, d) => sum + d.loggedMealSlots.length, 0);
  return Math.round((loggedSlots / totalSlots) * 100);
}

/** Simple deterministic recovery proxy from workout consistency — there's
 * no sleep/HR data source yet, so this stands in until one exists. */
export function computeRecoveryScore(recentLogs: DayLog[], plannedDaysPerWeek: number): number {
  if (recentLogs.length === 0 || plannedDaysPerWeek === 0) return 70;
  const completed = recentLogs.filter((d) => d.workoutCompleted).length;
  const expectedCompletions = (plannedDaysPerWeek / 7) * recentLogs.length;
  const ratio = expectedCompletions > 0 ? completed / expectedCompletions : 0;
  // 1.0 ratio (on-plan) -> ~85; overtraining (>1.3x) or undertraining pulls it down.
  const score = 85 - Math.abs(1 - ratio) * 40;
  return Math.max(40, Math.min(95, Math.round(score)));
}
