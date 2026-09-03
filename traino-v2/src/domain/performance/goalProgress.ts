import type { Goal } from '../engine/types';
import type {
  ExercisePerformanceMetrics,
  GoalProgressComponent,
  GoalProgressSummary,
  NutritionProgressSummary,
  ReadinessTrendSummary,
  TrainingConsistencySummary,
  WeightTrendSummary,
} from './types';

/**
 * Goal Progress (spec §12) — a weighted combination of the metrics relevant
 * to the athlete's selected goal. The weighting is a static, documented,
 * goal-keyed configuration table (never a `sport ===` branch — this reads
 * `Goal`, an athlete-selected value, exactly the per-goal combination spec
 * §12 itself specifies). Any component with insufficient data is excluded
 * and the remaining weights renormalize — a goal is never scored from
 * fabricated data, and `overallScore` is null (not 0) when nothing has
 * enough evidence yet.
 */

function trainingScore(consistency: TrainingConsistencySummary): number | null {
  return consistency.hasData ? Math.min(100, Math.max(0, consistency.completionPct)) : null;
}

function nutritionScore(nutrition: NutritionProgressSummary): number | null {
  return nutrition.hasDetailedData && nutrition.caloriesAdherencePct !== null ? nutrition.caloriesAdherencePct : null;
}

function readinessScore(readiness: ReadinessTrendSummary): number | null {
  return readiness.hasData ? readiness.averageScore : null;
}

/** A weight-trend "alignment" turned into a 0-100 score for the weighted
 * average — conservative, never a medical judgement: diverging from the
 * goal costs points without being punitive (never 0), and a genuinely
 * inapplicable/insufficient alignment is excluded entirely rather than
 * guessed at. */
function weightScore(weight: WeightTrendSummary): number | null {
  switch (weight.goalAlignment) {
    case 'aligned':
    case 'stable_as_expected':
      return 100;
    case 'diverging':
      return 35;
    case 'not_applicable':
    case 'insufficient_data':
      return null;
  }
}

/** Exercise performance score: the share of exercises with an established
 * trend that are improving or holding steady, weighted toward sport-relevant
 * exercises when that metadata is available (spec §13) — reads the Exercise
 * Library's own `sportRelevance` tag, never an `if sport` branch. Falls back
 * to every exercise with trend data when no sport-tagged exercise has
 * evidence yet. */
function exercisePerformanceScore(exercises: ExercisePerformanceMetrics[]): number | null {
  const withTrend = exercises.filter((e) => e.trend.state !== 'insufficient_data');
  const primary = withTrend.filter((e) => e.sportRelevance === 'primary');
  const pool = primary.length > 0 ? primary : withTrend;
  if (pool.length === 0) return null;

  const points = pool.reduce((sum, e) => {
    if (e.trend.state === 'improving') return sum + 1;
    if (e.trend.state === 'stable') return sum + 0.6;
    return sum; // declining
  }, 0);
  return Math.round((points / pool.length) * 100);
}

interface GoalMetricConfig {
  label: string;
  weight: number;
  score: (input: {
    trainingConsistency: TrainingConsistencySummary;
    nutrition: NutritionProgressSummary;
    readiness: ReadinessTrendSummary;
    weight: WeightTrendSummary;
    exercises: ExercisePerformanceMetrics[];
  }) => number | null;
}

const GOAL_METRIC_CONFIG: Record<Goal, GoalMetricConfig[]> = {
  fat_loss: [
    { label: 'Weight trend', weight: 0.4, score: (i) => weightScore(i.weight) },
    { label: 'Training consistency', weight: 0.35, score: (i) => trainingScore(i.trainingConsistency) },
    { label: 'Nutrition adherence', weight: 0.25, score: (i) => nutritionScore(i.nutrition) },
  ],
  muscle_gain: [
    { label: 'Exercise performance', weight: 0.3, score: (i) => exercisePerformanceScore(i.exercises) },
    { label: 'Training consistency', weight: 0.25, score: (i) => trainingScore(i.trainingConsistency) },
    { label: 'Weight trend', weight: 0.25, score: (i) => weightScore(i.weight) },
    { label: 'Nutrition adherence', weight: 0.2, score: (i) => nutritionScore(i.nutrition) },
  ],
  performance: [
    { label: 'Sport-relevant exercise performance', weight: 0.35, score: (i) => exercisePerformanceScore(i.exercises) },
    { label: 'Training consistency', weight: 0.25, score: (i) => trainingScore(i.trainingConsistency) },
    { label: 'Readiness', weight: 0.2, score: (i) => readinessScore(i.readiness) },
    { label: 'Nutrition adherence', weight: 0.2, score: (i) => nutritionScore(i.nutrition) },
  ],
  general_fitness: [
    { label: 'Weight stability', weight: 0.4, score: (i) => weightScore(i.weight) },
    { label: 'Training consistency', weight: 0.35, score: (i) => trainingScore(i.trainingConsistency) },
    { label: 'Nutrition adherence', weight: 0.25, score: (i) => nutritionScore(i.nutrition) },
  ],
  recovery: [
    { label: 'Training consistency', weight: 0.4, score: (i) => trainingScore(i.trainingConsistency) },
    { label: 'Readiness', weight: 0.35, score: (i) => readinessScore(i.readiness) },
    { label: 'Weight stability', weight: 0.25, score: (i) => weightScore(i.weight) },
  ],
};

export function buildGoalProgress(
  goal: Goal,
  trainingConsistency: TrainingConsistencySummary,
  nutrition: NutritionProgressSummary,
  readiness: ReadinessTrendSummary,
  weight: WeightTrendSummary,
  exercises: ExercisePerformanceMetrics[]
): GoalProgressSummary {
  const config = GOAL_METRIC_CONFIG[goal];
  const input = { trainingConsistency, nutrition, readiness, weight, exercises };

  const components: GoalProgressComponent[] = config.map((c) => ({
    label: c.label,
    weight: c.weight,
    score: c.score(input),
  }));

  const available = components.filter((c) => c.score !== null);
  const totalAvailableWeight = available.reduce((sum, c) => sum + c.weight, 0);
  const overallScore =
    totalAvailableWeight > 0
      ? Math.round(available.reduce((sum, c) => sum + (c.score as number) * c.weight, 0) / totalAvailableWeight)
      : null;

  return { goal, overallScore, components };
}
