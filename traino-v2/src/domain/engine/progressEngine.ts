import type { DayLog } from '../state/LogContext';
import type { PerformanceCategory } from './types';
import type { ExercisePerformanceLog } from '../progression/types';

export type { PerformanceCategory };

export type ExerciseTrendDirection = 'improving' | 'declining' | 'steady' | 'not_enough_data';

export interface ExerciseTrendResult {
  exerciseName: string;
  /** Human-readable "what you did" for the two most recent FULLY-completed exposures —
   * never built from a partial/missed session's numbers. Null when there's only one
   * (or zero) qualifying exposure to compare. */
  previousLabel: string | null;
  currentLabel: string;
  trend: ExerciseTrendDirection;
}

/** The one number that best represents a logged exposure's difficulty — whichever
 * metric that exercise's model actually reports, in a fixed preference order (a
 * loaded exercise is judged by load, not reps, once load is being tracked). Returns
 * null for a log with no comparable numeric evidence at all (e.g. technique-only). */
function primaryMetric(log: ExercisePerformanceLog): { label: string; value: number } | null {
  if (log.loadKg !== undefined) {
    return { label: log.repsAchieved !== undefined ? `${log.repsAchieved} reps @ ${log.loadKg}kg` : `${log.loadKg}kg`, value: log.loadKg };
  }
  if (log.distanceM !== undefined) return { label: `${log.distanceM}m`, value: log.distanceM };
  if (log.durationSec !== undefined) return { label: `${log.durationSec} sec`, value: log.durationSec };
  if (log.repsAchieved !== undefined) return { label: `${log.repsAchieved} reps`, value: log.repsAchieved };
  return null;
}

/**
 * Derives a real, honestly-empty-when-absent progress trend from an exercise's own
 * logged history — never fabricated. Only fully-completed exposures are compared
 * (a partial/missed session proves nothing about whether performance is improving).
 */
export function computeExerciseTrend(exerciseName: string, history: ExercisePerformanceLog[]): ExerciseTrendResult | null {
  const fullyCompleted = history.filter((log) => log.prescribedSets > 0 && log.completedSets >= log.prescribedSets);
  const withMetric = fullyCompleted
    .map((log) => ({ log, metric: primaryMetric(log) }))
    .filter((e): e is { log: ExercisePerformanceLog; metric: { label: string; value: number } } => e.metric !== null);

  if (withMetric.length === 0) return null;

  const current = withMetric[withMetric.length - 1];
  const previous = withMetric.length > 1 ? withMetric[withMetric.length - 2] : null;

  let trend: ExerciseTrendDirection = 'not_enough_data';
  if (previous) {
    if (current.metric.value > previous.metric.value) trend = 'improving';
    else if (current.metric.value < previous.metric.value) trend = 'declining';
    else trend = 'steady';
  }

  return {
    exerciseName,
    previousLabel: previous ? previous.metric.label : null,
    currentLabel: current.metric.label,
    trend,
  };
}

/**
 * Derives Progress-screen stats from real logged history (LogContext) —
 * no fabricated numbers. With little or no history yet, stats come back
 * honestly flat/zero rather than pretending to have data.
 */

/** Legacy fallback only: logs written before `WorkoutDayTemplate.statCategory`
 * existed have no stored category, so guess one from the workout's name.
 * Every current sport module sets `statCategory` explicitly and should never
 * need this. */
function deriveStatCategoryFromName(workoutName: string): PerformanceCategory {
  const name = workoutName.toLowerCase();
  if (name.includes('speed') || name.includes('sprint')) return 'speed';
  if (name.includes('agility') || name.includes('conditioning')) return 'stamina';
  return 'strength';
}

function categoryForDay(day: DayLog): PerformanceCategory {
  return day.statCategory ?? deriveStatCategoryFromName(day.workoutName ?? '');
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
    if (day.workoutCompleted && (day.statCategory || day.workoutName)) {
      completedByCategory[categoryForDay(day)].push(day);
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

/** Weight change between the last logged weigh-in of `currentWeekLogs` and the last
 * logged weigh-in of `priorWeekLogs` — the same week-over-week comparison the Weekly
 * Report and the Weekly Coaching Loop both need; computed once here rather than
 * duplicated inline in each screen/engine that wants it. */
export function computeWeekOverWeekWeightDelta(
  currentWeekLogs: DayLog[],
  priorWeekLogs: DayLog[]
): { deltaKg: number; hasData: boolean } {
  const isWeighIn = (d: DayLog): d is DayLog & { weightKg: number } => typeof d.weightKg === 'number';
  const current = currentWeekLogs.filter(isWeighIn);
  const prior = priorWeekLogs.filter(isWeighIn);
  if (current.length === 0 || prior.length === 0) return { deltaKg: 0, hasData: false };
  const deltaKg = Math.round((current[current.length - 1].weightKg - prior[prior.length - 1].weightKg) * 10) / 10;
  return { deltaKg, hasData: true };
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
