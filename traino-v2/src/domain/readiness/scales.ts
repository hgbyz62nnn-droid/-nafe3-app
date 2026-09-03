import type { IconName } from '../../components/ui/Icon';
import type { DailyReadinessInputs, ReadinessScale, ReadinessStatus } from './types';

/** Shared status -> display label/color, reused by the Daily Check-in result view
 * and the Home summary card so both surfaces describe a status identically. */
export const READINESS_STATUS_LABEL: Record<ReadinessStatus, string> = {
  high: 'High readiness',
  normal: 'Good to train',
  reduced: 'Reduced readiness',
  recovery: 'Recovery recommended',
};

export const READINESS_STATUS_COLOR: Record<ReadinessStatus, string> = {
  high: 'text-success',
  normal: 'text-success',
  reduced: 'text-red',
  recovery: 'text-red',
};

/**
 * UI option lists for the Daily Check-in — one structured 1-5 scale per
 * factor, mirroring the option-list pattern already used for barriers/
 * assessment questions. `READINESS_QUESTIONS` lets the screen render all
 * six factors from one generic loop instead of six hand-written blocks.
 */

export interface ScaleOption {
  value: ReadinessScale;
  label: string;
}

export const SLEEP_QUALITY_OPTIONS: ScaleOption[] = [
  { value: 1, label: 'Very poor' },
  { value: 2, label: 'Poor' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Excellent' },
];

export const SLEEP_DURATION_OPTIONS: ScaleOption[] = [
  { value: 1, label: 'Under 5h' },
  { value: 2, label: '5-6h' },
  { value: 3, label: '6-7h' },
  { value: 4, label: '7-8h' },
  { value: 5, label: '8h+' },
];

export const ENERGY_OPTIONS: ScaleOption[] = [
  { value: 1, label: 'Very low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Very high' },
];

export const STRESS_OPTIONS: ScaleOption[] = [
  { value: 1, label: 'Very calm' },
  { value: 2, label: 'Calm' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'Stressed' },
  { value: 5, label: 'Very stressed' },
];

export const SORENESS_OPTIONS: ScaleOption[] = [
  { value: 1, label: 'None' },
  { value: 2, label: 'Mild' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'Sore' },
  { value: 5, label: 'Very sore' },
];

export const MOTIVATION_OPTIONS: ScaleOption[] = [
  { value: 1, label: 'Very low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Very high' },
];

type ScaleFactorKey = 'sleepQuality' | 'sleepDurationBucket' | 'energy' | 'stress' | 'soreness' | 'motivation';

export interface ReadinessQuestion {
  key: ScaleFactorKey;
  title: string;
  icon: IconName;
  options: ScaleOption[];
}

export const READINESS_QUESTIONS: ReadinessQuestion[] = [
  { key: 'sleepQuality', title: 'How was your sleep quality?', icon: 'moon', options: SLEEP_QUALITY_OPTIONS },
  { key: 'sleepDurationBucket', title: 'How long did you sleep?', icon: 'clock', options: SLEEP_DURATION_OPTIONS },
  { key: 'energy', title: 'How is your energy today?', icon: 'battery', options: ENERGY_OPTIONS },
  { key: 'stress', title: 'How stressed do you feel?', icon: 'stress', options: STRESS_OPTIONS },
  { key: 'soreness', title: 'How sore are your muscles?', icon: 'dumbbell', options: SORENESS_OPTIONS },
  { key: 'motivation', title: 'How motivated do you feel?', icon: 'star', options: MOTIVATION_OPTIONS },
];

export function defaultReadinessInputs(): DailyReadinessInputs {
  return {
    sleepQuality: 3,
    sleepDurationBucket: 3,
    energy: 3,
    stress: 3,
    soreness: 1,
    motivation: 3,
    painFlag: false,
  };
}
