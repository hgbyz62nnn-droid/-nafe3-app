import type { AssessmentAnswers, Goal, NutritionTargets, SportModuleData } from './types';

/**
 * Deterministic nutrition targets: Mifflin-St Jeor BMR, a fixed
 * activity-multiplier table keyed off weekly training frequency, and a
 * fixed goal adjustment — all static formulas/tables, no external call.
 */

function bmr(answers: AssessmentAnswers): number {
  const { sex, weightKg, heightCm, age } = answers;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

function activityMultiplier(daysPerWeek: number): number {
  if (daysPerWeek >= 6) return 1.9;
  if (daysPerWeek >= 5) return 1.725;
  if (daysPerWeek >= 3) return 1.55;
  if (daysPerWeek >= 1) return 1.375;
  return 1.2;
}

const GOAL_CALORIE_FACTOR: Record<Goal, number> = {
  fat_loss: 0.8,
  muscle_gain: 1.1,
  performance: 1.0,
  general_fitness: 1.0,
  recovery: 0.97,
};

export function calculateNutritionTargets(
  answers: AssessmentAnswers,
  sportProfile: SportModuleData['nutritionProfile']
): NutritionTargets {
  const tdee = bmr(answers) * activityMultiplier(answers.daysAvailablePerWeek);
  const calories = Math.round(tdee * GOAL_CALORIE_FACTOR[answers.goal]);

  const proteinG = Math.round(answers.weightKg * sportProfile.proteinGPerKg);
  const proteinKcal = proteinG * 4;

  const fatShare = sportProfile.carbBias === 'low' ? 0.32 : sportProfile.carbBias === 'high' ? 0.22 : 0.27;
  const fatG = Math.round((calories * fatShare) / 9);
  const fatKcal = fatG * 9;

  const carbsKcal = Math.max(calories - proteinKcal - fatKcal, 0);
  const carbsG = Math.round(carbsKcal / 4);

  return { calories, proteinG, carbsG, fatG };
}
