import type { AssessmentAnswers } from '../engine/types';
import type { NutritionProfile } from './types';

/**
 * Derives the Nutrition Engine's `NutritionProfile` from the athlete's own
 * already-sanitized `AssessmentAnswers` — never a second, separately-
 * collected profile. `dislikedFoodIds`/`likedFoodIds` are deterministic
 * signals derived from real logging/replacement history (see
 * `domain/nutrition/preferences.ts`), passed in by the caller rather than
 * fabricated here.
 */
export function deriveNutritionProfile(
  answers: AssessmentAnswers,
  signals: { dislikedFoodIds: string[]; likedFoodIds: string[]; isTrainingDay: boolean }
): NutritionProfile {
  return {
    goal: answers.goal,
    sex: answers.sex,
    weightKg: answers.weightKg,
    heightCm: answers.heightCm,
    age: answers.age,
    daysAvailablePerWeek: answers.daysAvailablePerWeek,
    sport: answers.sport,
    dietaryPreference: answers.dietaryPreference,
    allergyIds: answers.allergyIds,
    budgetTier: answers.budgetTier,
    mealsPerDay: answers.mealsPerDay ?? 4,
    dislikedFoodIds: signals.dislikedFoodIds,
    likedFoodIds: signals.likedFoodIds,
    isTrainingDay: signals.isTrainingDay,
  };
}
