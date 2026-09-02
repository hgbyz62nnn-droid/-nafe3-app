import type { WeeklyReportData } from './types';

export interface WeekLog {
  workoutsCompleted: number;
  workoutsPlanned: number;
  nutritionAdherencePct: number;
  recoveryAveragePct: number;
  weightDeltaKg: number;
  weakestArea: 'lower_body' | 'upper_body' | 'conditioning' | 'nutrition' | 'recovery' | 'none';
  strongestArea: 'lower_body' | 'upper_body' | 'conditioning' | 'nutrition' | 'recovery' | 'none';
}

const RECOVERY_LABEL_THRESHOLDS: [number, string][] = [
  [85, 'Excellent'],
  [70, 'Good'],
  [50, 'Fair'],
  [0, 'Needs attention'],
];

function labelForRecovery(pct: number): string {
  return RECOVERY_LABEL_THRESHOLDS.find(([min]) => pct >= min)?.[1] ?? 'Fair';
}

const AREA_FEEDBACK: Record<WeekLog['weakestArea'], string> = {
  lower_body: 'upper body strength',
  upper_body: 'lower body power',
  conditioning: 'conditioning and recovery',
  nutrition: 'nutrition consistency',
  recovery: 'sleep and recovery habits',
  none: 'consistency across the board',
};

const AREA_PRAISE: Record<WeekLog['strongestArea'], string> = {
  lower_body: 'lower-body performance improved',
  upper_body: 'upper-body strength improved',
  conditioning: 'conditioning improved',
  nutrition: 'your nutrition consistency is great',
  recovery: 'your recovery habits are paying off',
  none: 'you stayed consistent',
};

/**
 * Rule-based weekly-report copy: fixed headline/feedback templates
 * selected by static thresholds over the week's logged numbers — no
 * generation, no external call.
 */
export function generateWeeklyReport(log: WeekLog): WeeklyReportData {
  const completionRatio = log.workoutsPlanned > 0 ? log.workoutsCompleted / log.workoutsPlanned : 0;
  const headline =
    completionRatio >= 0.9
      ? 'Great work this week!'
      : completionRatio >= 0.6
        ? 'Solid progress this week'
        : "Let's build momentum next week";

  const coachFeedback =
    log.weakestArea === log.strongestArea
      ? `${AREA_PRAISE[log.strongestArea]}. Let's keep building on that next week.`
      : `${AREA_PRAISE[log.strongestArea]}. Let's focus on ${AREA_FEEDBACK[log.weakestArea]} next week.`;

  return {
    headline,
    subtext: 'Your consistency and intensity are building real progress.',
    workoutsCompleted: log.workoutsCompleted,
    workoutsPlanned: log.workoutsPlanned,
    nutritionAdherencePct: log.nutritionAdherencePct,
    recoveryLabel: labelForRecovery(log.recoveryAveragePct),
    recoveryAveragePct: log.recoveryAveragePct,
    weightDeltaKg: log.weightDeltaKg,
    coachFeedback,
  };
}
