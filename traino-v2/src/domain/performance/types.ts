import type { ExercisePerformanceLog, ExerciseProgressionDecision, ProgressionModel } from '../progression/types';
import type { Goal } from '../engine/types';

/**
 * Performance Analytics — shared types.
 *
 * This layer answers "am I improving, what exactly, what's stable, what's
 * declining" from REAL stored history only (`ExercisePerformanceLog`,
 * `DailyReadinessRecord`, `DayLog.weightKg`/`nutritionLogs`, Travel/
 * Competition context metadata) — never fabricated. Everything here is a
 * pure, deterministic read over existing persisted state (see
 * `normalizedHistory.ts`); nothing is stored twice, nothing is generated.
 */

/** The one trend vocabulary reused everywhere (exercise metrics, nutrition,
 * readiness, weight, goal progress) — see `trendClassifier.ts`. Never
 * classified from a single isolated data point (spec §4/§31 invariant #2). */
export type TrendState = 'improving' | 'stable' | 'declining' | 'insufficient_data';

/** How much evidence a non-insufficient trend actually rests on — a trend can
 * be `improving` with only `limited` confidence (2-3 comparable points), and
 * callers should hedge language accordingly (spec §15). */
export type TrendConfidence = 'sufficient' | 'limited' | 'insufficient';

export interface TrendResult {
  state: TrendState;
  confidence: TrendConfidence;
  /** How many comparable data points the classification is based on. */
  sampleSize: number;
}

/** One comparable numeric exposure for a specific exercise/model — never
 * mixes models or contexts (spec §5: Normal vs Travel vs Competition vs
 * substituted-exercise histories are never blindly compared). */
export interface ComparableExposure {
  date: string;
  value: number;
  /** Human-readable label for this exposure's value, e.g. "72.5kg" or "8 reps". */
  label: string;
}

/** A deterministically-detected Personal Record — only ever claimed within a
 * single comparable bracket (spec §6: 70kg×10 is never compared against
 * 72.5kg×8; each rep-count bracket tracks its own record). */
export interface PersonalRecord {
  exerciseName: string;
  model: ProgressionModel;
  /** What makes this bracket comparable, e.g. "10 reps" (load model) or "PR" (others). */
  bracketLabel: string;
  value: number;
  label: string;
  achievedOn: string;
  /** True when the MOST RECENT qualifying exposure is what set this record
   * (vs. an older exposure that still stands unbeaten). */
  isRecent: boolean;
}

export type MilestoneType =
  | 'first_exposure'
  | 'three_exposures'
  | 'progression_achieved'
  | 'new_personal_record'
  | 'consistency'
  | 'nutrition_adherence';

export interface Milestone {
  type: MilestoneType;
  date: string;
  /** Pre-templated, deterministic description — never generated. */
  message: string;
  exerciseName?: string;
}

export interface ExercisePerformanceMetrics {
  exerciseName: string;
  model: ProgressionModel;
  /** All logged exposures for this exercise, unfiltered — for display/audit only. */
  totalExposures: number;
  successfulExposures: number;
  failedOrPartialExposures: number;
  /** Exposures logged under an active Travel/Competition context — visible
   * historically but never folded into `trend` (spec §17). */
  contextualExposureCount: number;
  previous: ComparableExposure | null;
  current: ComparableExposure | null;
  best: ComparableExposure | null;
  /** Trend computed ONLY from normal-context, fully-completed, comparable
   * exposures (spec §5). */
  trend: TrendResult;
  personalRecords: PersonalRecord[];
  /** The exercise-level Progression Engine's latest decision for this exercise
   * (spec §19: performance evidence -> progression decision, from real stored
   * data, never invented) — null when there's no evidence yet or the model
   * has nothing numeric to progress. */
  latestProgressionDecision: ExerciseProgressionDecision | null;
  /** How relevant this exercise is to the athlete's sport, from the Exercise
   * Library's own `sportRelevance` metadata (spec §13) — never an `if sport`
   * branch. Undefined when the exercise isn't in the Library or the sport
   * has no recorded relevance for it. */
  sportRelevance?: 'primary' | 'supportive' | 'general';
}

export interface TrainingConsistencySummary {
  hasData: boolean;
  plannedSessions: number;
  completedSessions: number;
  /** Completed sessions that were logged under an active Travel or
   * Competition context (i.e. adjusted from the base plan). */
  adjustedSessions: number;
  travelAdjustedSessions: number;
  /** Competition event days where the base session was intentionally skipped
   * (spec §8/§21: never counted as an ordinary missed workout). */
  intentionallySkippedCompetitionSessions: number;
  /** 0-100, bounded. `plannedSessions` is already context-adjusted (reuses
   * `computeContextAdjustedPlannedSessions`), so this never penalizes a
   * travel/competition-adapted week for being smaller than the normal cadence. */
  completionPct: number;
}

export interface NutritionProgressSummary {
  hasDetailedData: boolean;
  caloriesAdherencePct: number | null;
  proteinAdherencePct: number | null;
  mealCompletionPct: number;
  daysWithDetailedLogs: number;
  /** Week-over-week trend of calorie adherence — insufficient_data whenever
   * either week lacks detailed logging, never shown as a false 0%. */
  trend: TrendResult;
}

export interface ReadinessTrendSummary {
  hasData: boolean;
  checkInsCount: number;
  averageScore: number | null;
  lowReadinessDaysCount: number;
  scoreTrend: TrendResult;
  sleepTrend: TrendResult;
  energyTrend: TrendResult;
  sorenessTrend: TrendResult;
  stressTrend: TrendResult;
}

export type WeightGoalAlignment = 'aligned' | 'diverging' | 'stable_as_expected' | 'not_applicable' | 'insufficient_data';

export interface WeightTrendSummary {
  hasData: boolean;
  points: number[];
  deltaKg: number;
  trend: TrendResult;
  /** Cautious, non-medical goal-aware interpretation (spec §11) — never a
   * diagnosis, never forces a direction for a goal that doesn't require one. */
  goalAlignment: WeightGoalAlignment;
}

export interface GoalProgressComponent {
  label: string;
  /** 0-100, or null when this component has insufficient data (excluded from
   * the weighted average rather than presented as 0). */
  score: number | null;
  weight: number;
}

export interface GoalProgressSummary {
  goal: Goal;
  /** 0-100 weighted average of available components, or null when NO
   * component has enough data yet (never a fabricated default). */
  overallScore: number | null;
  components: GoalProgressComponent[];
}

export interface WeekComparisonMetric {
  label: string;
  thisWeek: number | null;
  lastWeek: number | null;
  /** 'up' | 'down' | 'unchanged' | 'insufficient_data' — a structured
   * direction only, never a causal explanation (spec §14). */
  direction: 'up' | 'down' | 'unchanged' | 'insufficient_data';
}

export interface WeekComparisonSummary {
  metrics: WeekComparisonMetric[];
}

export interface PerformanceSummary {
  exercises: ExercisePerformanceMetrics[];
  trainingConsistency: TrainingConsistencySummary;
  nutrition: NutritionProgressSummary;
  readiness: ReadinessTrendSummary;
  weight: WeightTrendSummary;
  goalProgress: GoalProgressSummary;
  weekComparison: WeekComparisonSummary;
  milestones: Milestone[];
}

/** Re-exported for convenience so consumers of this module don't also need
 * to import from `../progression/types` for the one type they share. */
export type { ExercisePerformanceLog };
