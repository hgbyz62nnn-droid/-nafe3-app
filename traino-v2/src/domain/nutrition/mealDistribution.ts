/**
 * Configurable meal distribution (spec §13) — how the daily calorie target
 * splits across the athlete's chosen number of meals. A fixed, documented
 * table, not a formula guessed per-athlete: the athlete's own
 * `mealsPerDay` (3, 4, or 5) selects one row; the Daily Plan Builder never
 * forces a universal 3-meal or 4-meal schedule.
 */
export interface MealSlotShare {
  slotId: string;
  slotLabel: string;
  share: number;
}

export const MEAL_DISTRIBUTIONS: Record<3 | 4 | 5, MealSlotShare[]> = {
  3: [
    { slotId: 'breakfast', slotLabel: 'Breakfast', share: 0.3 },
    { slotId: 'lunch', slotLabel: 'Lunch', share: 0.4 },
    { slotId: 'dinner', slotLabel: 'Dinner', share: 0.3 },
  ],
  4: [
    { slotId: 'breakfast', slotLabel: 'Breakfast', share: 0.25 },
    { slotId: 'lunch', slotLabel: 'Lunch', share: 0.3 },
    { slotId: 'snack', slotLabel: 'Snack', share: 0.15 },
    { slotId: 'dinner', slotLabel: 'Dinner', share: 0.3 },
  ],
  5: [
    { slotId: 'breakfast', slotLabel: 'Breakfast', share: 0.22 },
    { slotId: 'snack_1', slotLabel: 'Morning Snack', share: 0.13 },
    { slotId: 'lunch', slotLabel: 'Lunch', share: 0.28 },
    { slotId: 'snack_2', slotLabel: 'Afternoon Snack', share: 0.12 },
    { slotId: 'dinner', slotLabel: 'Dinner', share: 0.25 },
  ],
};

export function isSupportedMealCount(value: number): value is 3 | 4 | 5 {
  return value === 3 || value === 4 || value === 5;
}
