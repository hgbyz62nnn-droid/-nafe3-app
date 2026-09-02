import type { DietaryPreference, BudgetTier } from '../engine/types';
import type { IconName } from '../../components/ui/Icon';

export interface DietPreferenceOption {
  id: DietaryPreference;
  name: string;
  description: string;
  icon: IconName;
}

export const DIET_PREFERENCE_OPTIONS: DietPreferenceOption[] = [
  { id: 'no_restriction', name: 'No Restriction', description: 'I eat everything', icon: 'nutrition' },
  { id: 'vegetarian', name: 'Vegetarian', description: 'No meat or fish', icon: 'food' },
  { id: 'vegan', name: 'Vegan', description: 'No animal products', icon: 'food' },
  { id: 'high_protein', name: 'High Protein', description: 'Protein-forward meals', icon: 'dumbbell' },
  { id: 'low_carb', name: 'Low Carb', description: 'Reduced carbohydrate meals', icon: 'fatLoss' },
];

export interface AllergyOption {
  id: string;
  name: string;
}

export const ALLERGY_OPTIONS: AllergyOption[] = [
  { id: 'none', name: 'None' },
  { id: 'dairy', name: 'Dairy' },
  { id: 'gluten', name: 'Gluten' },
  { id: 'nuts', name: 'Nuts' },
  { id: 'shellfish', name: 'Shellfish' },
  { id: 'eggs', name: 'Eggs' },
];

export interface BudgetOption {
  id: BudgetTier;
  name: string;
  description: string;
}

export const BUDGET_OPTIONS: BudgetOption[] = [
  { id: 'low', name: 'Budget-friendly', description: 'Simple, affordable staples' },
  { id: 'medium', name: 'Moderate', description: 'A balanced mix' },
  { id: 'high', name: 'Flexible', description: 'Quality over cost' },
];
