import type { IconName } from '../../components/ui/Icon';

export interface TrainingLocationOption {
  id: string;
  name: string;
  description: string;
  icon: IconName;
}

export const TRAINING_LOCATIONS: TrainingLocationOption[] = [
  { id: 'gym', name: 'Gym', description: 'Fully equipped', icon: 'dumbbell' },
  { id: 'home', name: 'Home', description: 'Train at home', icon: 'home' },
  { id: 'sports_club', name: 'Sports Club', description: 'Club facilities', icon: 'sportsClub' },
  { id: 'outdoor', name: 'Outdoor', description: 'Parks, open spaces', icon: 'outdoor' },
  { id: 'sports_field', name: 'Sports Field', description: 'Football fields, track', icon: 'sportsField' },
  { id: 'pool', name: 'Pool', description: 'Swimming pool access', icon: 'pool' },
  { id: 'multiple', name: 'Multiple Locations', description: 'I train in more than one place', icon: 'multiLocation' },
];
