import type { FoodMatchReasonCode } from './types';

/** Shared display-text for Food Intelligence data — one place so the Nutrition UI
 * and the AI Coach's nutrition replies render the exact same fixed vocabulary
 * instead of duplicating it (mirrors domain/exercise/labels.ts). */
export const FOOD_MATCH_REASON_LABELS: Record<FoodMatchReasonCode, string> = {
  same_meal_role: 'Same meal role',
  macro_compatible: 'Similar nutrition profile',
  calorie_compatible: 'Fits the calorie target',
  budget_fit: 'Fits your budget',
  dietary_compatible: 'Matches your dietary preference',
  previously_preferred: "You've liked this before",
  variety: 'Adds variety',
  region_relevant: 'A common Egyptian/MENA staple',
};
