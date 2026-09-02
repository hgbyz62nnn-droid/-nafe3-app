import type { WeeklyReportData } from './types';

export type ReportArea = 'speed' | 'strength' | 'stamina' | 'nutrition' | 'recovery' | 'none';

export interface WeekLog {
  workoutsCompleted: number;
  workoutsPlanned: number;
  nutritionAdherencePct: number;
  recoveryAveragePct: number;
  weightDeltaKg: number;
  weakestArea: ReportArea;
  strongestArea: ReportArea;
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

const AREA_FEEDBACK: Record<ReportArea, string> = {
  speed: 'speed and lower-body power',
  strength: 'upper-body strength',
  stamina: 'conditioning and stamina',
  nutrition: 'nutrition consistency',
  recovery: 'sleep and recovery habits',
  none: 'consistency across the board',
};

const AREA_PRAISE: Record<ReportArea, string> = {
  speed: 'Your speed work is paying off',
  strength: 'Your strength work improved',
  stamina: 'Your conditioning improved',
  nutrition: 'Your nutrition consistency is great',
  recovery: 'Your recovery habits are paying off',
  none: 'You stayed consistent',
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
