import type { IconName } from '../../components/ui/Icon';

/**
 * The closed set of adherence barriers an athlete can select during a
 * Weekly Check-in. Kept structured and enumerable (not free text) so the
 * Weekly Coaching Engine can key deterministic rules off of it — the
 * optional free-text note the check-in also collects is stored for the
 * athlete's own context only and is never read by any engine.
 */
export type BarrierId =
  | 'time'
  | 'poor_sleep'
  | 'fatigue'
  | 'work_study'
  | 'stress'
  | 'motivation'
  | 'workout_difficulty'
  | 'injury_pain'
  | 'lack_of_equipment'
  | 'travel'
  | 'nutrition_difficulty'
  | 'budget'
  | 'schedule_conflict'
  | 'other';

export interface BarrierOption {
  id: BarrierId;
  name: string;
  description: string;
  icon: IconName;
}

export const BARRIER_OPTIONS: BarrierOption[] = [
  { id: 'time', name: 'Not enough time', description: 'Sessions took longer than I had available', icon: 'clock' },
  { id: 'poor_sleep', name: 'Poor sleep', description: "Didn't sleep well enough to train", icon: 'moon' },
  { id: 'fatigue', name: 'Fatigue', description: 'Felt too tired or sore', icon: 'heart' },
  { id: 'work_study', name: 'Work / study', description: 'Work or school took priority', icon: 'client' },
  { id: 'stress', name: 'Stress', description: 'Felt overwhelmed or stressed', icon: 'stress' },
  { id: 'motivation', name: 'Motivation', description: "Didn't feel like training", icon: 'star' },
  { id: 'workout_difficulty', name: 'Workout too hard', description: 'Sessions felt too difficult', icon: 'dumbbell' },
  { id: 'injury_pain', name: 'Injury / pain', description: 'Pain or discomfort during training', icon: 'target' },
  { id: 'lack_of_equipment', name: 'No equipment', description: "Didn't have access to equipment", icon: 'otherEquipment' },
  { id: 'travel', name: 'Travel', description: 'Was away from my usual setup', icon: 'suitcase' },
  { id: 'nutrition_difficulty', name: 'Nutrition was hard', description: 'Struggled to stick to meals', icon: 'nutrition' },
  { id: 'budget', name: 'Budget', description: 'Cost got in the way', icon: 'wallet' },
  { id: 'schedule_conflict', name: 'Schedule conflict', description: 'Something else came up', icon: 'calendar' },
  { id: 'other', name: 'Other', description: "Something not listed here", icon: 'otherEquipment' },
];

/** Shared display-name lookup so every screen shows the same wording for a barrier
 * rather than re-deriving it (e.g. from the raw id) independently. */
export function barrierDisplayName(id: BarrierId | null | undefined): string {
  if (!id) return 'nothing specific';
  return BARRIER_OPTIONS.find((b) => b.id === id)?.name ?? id.replace(/_/g, ' ');
}
