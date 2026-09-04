export interface BucketOption {
  id: string;
  label: string;
  description: string;
  /** The numeric value fed into the engine when this bucket is chosen. */
  value: number;
}

export const EXPERIENCE_OPTIONS: BucketOption[] = [
  { id: 'new', label: 'New to it', description: 'Less than a year', value: 0.5 },
  { id: 'some', label: 'Some experience', description: '1-2 years', value: 1.5 },
  { id: 'experienced', label: 'Experienced', description: '3-5 years', value: 4 },
  { id: 'veteran', label: 'Veteran', description: '5+ years', value: 6 },
];

export const FREQUENCY_OPTIONS: BucketOption[] = [
  { id: 'low', label: '1-2 / week', description: 'A couple of sessions', value: 2 },
  { id: 'moderate', label: '3-4 / week', description: 'Most weekdays', value: 4 },
  { id: 'high', label: '5-6 / week', description: 'Almost every day', value: 5 },
  { id: 'daily', label: '7 / week', description: 'Every day', value: 7 },
];

/** Session-duration budget — a real generation constraint (planEngine.ts scales the
 * generated session's volume/duration to fit this). */
export const DURATION_OPTIONS: BucketOption[] = [
  { id: 'short', label: '20-30 min', description: 'Quick, focused session', value: 25 },
  { id: 'standard', label: '45 min', description: 'A full session', value: 45 },
  { id: 'long', label: '60 min', description: 'Extended session', value: 60 },
  { id: 'extended', label: '90 min', description: 'Long / high-volume session', value: 90 },
];

export interface PriorityOption {
  id: 'speed' | 'strength' | 'conditioning';
  name: string;
  description: string;
  icon: 'target' | 'dumbbell' | 'fitness';
}

/** Generic, sport-agnostic training emphasis — read as a per-category volume
 * multiplier by planEngine.ts, never a sport-specific rule. */
export const PRIORITY_OPTIONS: PriorityOption[] = [
  { id: 'speed', name: 'Speed & Power', description: 'Explosiveness, sprint/agility work', icon: 'target' },
  { id: 'strength', name: 'Strength', description: 'Loaded strength & muscle work', icon: 'dumbbell' },
  { id: 'conditioning', name: 'Conditioning', description: 'Endurance & work capacity', icon: 'fitness' },
];
