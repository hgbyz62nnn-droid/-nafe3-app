import type { IconName } from '../../components/ui/Icon';

export interface HealthLimitationOption {
  id: string;
  name: string;
  description: string;
  icon: IconName;
}

/** 'none' is mutually exclusive with every other option in the UI. */
export const HEALTH_LIMITATIONS: HealthLimitationOption[] = [
  { id: 'none', name: 'No injuries or limitations', description: "I'm training pain-free", icon: 'checkPlain' },
  { id: 'knee', name: 'Knee', description: 'Pain or previous injury', icon: 'target' },
  { id: 'shoulder', name: 'Shoulder', description: 'Pain or previous injury', icon: 'target' },
  { id: 'lower_back', name: 'Lower Back', description: 'Pain or previous injury', icon: 'target' },
  { id: 'ankle', name: 'Ankle', description: 'Pain or previous injury', icon: 'target' },
  { id: 'other', name: 'Other', description: "Something not listed here", icon: 'heart' },
];
