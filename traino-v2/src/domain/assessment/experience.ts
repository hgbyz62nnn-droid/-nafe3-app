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
