import type { Goal } from '../engine/types';
import type { IconName } from '../../components/ui/Icon';

export interface GoalOption {
  id: Goal;
  name: string;
  description: string;
  icon: IconName;
}

export const GOAL_OPTIONS: GoalOption[] = [
  { id: 'performance', name: 'Improve Performance', description: 'Get faster, stronger, more explosive', icon: 'target' },
  { id: 'fat_loss', name: 'Lose Fat', description: 'Lean out while keeping strength', icon: 'fatLoss' },
  { id: 'muscle_gain', name: 'Build Muscle', description: 'Add size and strength', icon: 'dumbbell' },
  { id: 'general_fitness', name: 'General Fitness', description: 'Stay active and healthy', icon: 'fitness' },
  { id: 'recovery', name: 'Recovery', description: 'Ease back in after a break or injury', icon: 'heart' },
];
