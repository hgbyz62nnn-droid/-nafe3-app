import type { ExerciseCategory } from '../engine/types';
import type { ProgressionModel } from '../progression/types';

/**
 * Exercise Intelligence — shared types.
 *
 * `ExerciseDefinition` is the generic knowledge record every deterministic
 * decision (selection, replacement, progression, injury-safe/equipment-aware
 * alternatives, sport relevance) reads from — never a hardcoded name check
 * inside an engine. Reuses existing controlled vocabularies wherever one
 * already exists (equipment ids from domain/assessment/equipment.ts,
 * contraindication tags from domain/assessment/health.ts, `ExerciseCategory`
 * from engine/types.ts, `ProgressionModel` from progression/types.ts) rather
 * than inventing parallel ones.
 */

/** How an exercise moves the body — the primary axis for finding a training-
 * intent-preserving replacement (a horizontal push should replace with
 * another horizontal push, not a random movement that merely "looks similar"). */
export type MovementPattern =
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'carry'
  | 'rotation'
  | 'anti_rotation'
  | 'anti_extension'
  | 'anti_lateral_flexion'
  | 'locomotion'
  | 'jump'
  | 'landing'
  | 'sprint'
  | 'acceleration'
  | 'deceleration'
  | 'change_of_direction'
  | 'balance'
  | 'mobility'
  | 'technique'
  | 'conditioning'
  | 'other';

/** Controlled muscle identifiers — coarse, anatomically-grounded groups, not
 * a fine-grained atlas this app has no authority to claim precisely. */
export type MuscleGroup =
  | 'chest'
  | 'upper_back'
  | 'lats'
  | 'shoulders'
  | 'triceps'
  | 'biceps'
  | 'forearms'
  | 'core'
  | 'obliques'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'
  | 'hip_flexors'
  | 'adductors'
  | 'full_body';

/** What a session/exercise is actually trying to accomplish — the axis
 * exercise replacement must preserve above all else besides safety. */
export type TrainingIntent =
  | 'strength'
  | 'hypertrophy'
  | 'power'
  | 'speed'
  | 'acceleration'
  | 'agility'
  | 'conditioning'
  | 'endurance'
  | 'technique'
  | 'mobility'
  | 'stability'
  | 'recovery';

export type ExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type ImpactLevel = 'low' | 'moderate' | 'high';

/** How demanding an exercise is on balance/proprioception vs. raw skill
 * execution — both purely ranking signals, never a hard filter. */
export type StabilityDemand = 'low' | 'moderate' | 'high';
export type TechnicalDemand = 'low' | 'moderate' | 'high';

/** How much sport-specific value an exercise carries for a given sport, on
 * a fixed scale — data the matching engine reads generically (never an
 * `if sport === '...'` inside the engine itself). */
export type SportRelevanceLevel = 'primary' | 'supportive' | 'general';

export interface SafetyMetadata {
  /** Health-limitation tag ids (see domain/assessment/health.ts) this movement should
   * be avoided for — the SAME field/vocabulary `ExerciseSlot.contraindications` already
   * uses; never a second, parallel injury taxonomy. */
  contraindications: string[];
  /** Jumping/sprinting/direction-change movements — same meaning as `ExerciseSlot.highImpact`. */
  highImpact: boolean;
  /** A short, non-diagnostic caution surfaced in the UI (e.g. "avoid if you have acute
   * shoulder pain") — never a medical claim, never an inferred condition. Optional. */
  cautionNote?: string;
}

/** A structured, ranked reason attached to a matching-engine candidate — the
 * "Same movement pattern" / "No equipment required" lines the UI shows, built
 * from the same fixed vocabulary every time (never generated text). */
export type MatchReasonCode =
  | 'same_movement_pattern'
  | 'same_training_intent'
  | 'muscle_overlap'
  | 'no_equipment_required'
  | 'equipment_available'
  | 'matches_athlete_level'
  | 'sport_relevant'
  | 'progression_compatible'
  | 'previously_preferred'
  | 'frequently_completed';

export interface ExerciseDefinition {
  id: string;
  /** The one authoritative name normalization keys off of — matches the name
   * this exercise appears under in an authored sport-module slot. */
  canonicalName: string;
  /** What the UI actually shows — usually equal to canonicalName. */
  displayName: string;
  /** Alternate spellings/phrasings that resolve to this same exercise
   * ("DB Bench Press", "Barbell Bench" -> the one "Bench Press" id). */
  aliases: string[];
  category: ExerciseCategory;
  movementPattern: MovementPattern;
  /** Real anatomical claims only where confidently known — [] (not fabricated)
   * when this exercise hasn't been curated with muscle data yet. */
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  /** Equipment ids (domain/assessment/equipment.ts) required for the primary
   * version — [] means bodyweight/no equipment needed, the same convention
   * `ExerciseSlot.equipment` already uses. */
  equipment: string[];
  difficulty: ExerciseDifficulty;
  trainingIntents: TrainingIntent[];
  /** The SAME `ProgressionModel` type the Progression Engine already uses — single
   * source of truth. When known/curated here, the engine reads it directly instead
   * of re-inferring from the raw reps string (see progressionModels.ts). */
  progressionModel: ProgressionModel;
  unilateral: boolean;
  impactLevel: ImpactLevel;
  stabilityDemand: StabilityDemand;
  technicalDemand: TechnicalDemand;
  /** Sport id (domain/sports/sports.ts) -> relevance. Empty/omitted sports are
   * simply not specially relevant — never treated as "irrelevant/unsafe". */
  sportRelevance: Partial<Record<string, SportRelevanceLevel>>;
  /** Empty arrays (not omitted) when not yet curated — callers should treat
   * "[]" as "nothing authored", never render a blank/broken instructions panel. */
  coachingCues: string[];
  commonMistakes: string[];
  instructions: string[];
  /** Placeholder-safe: AssetSlot already renders a clear placeholder with no `src`. */
  imageRef?: string;
  videoRef?: string;
  /** Other ExerciseDefinition ids, validated to exist and never self-referential. */
  alternativeIds: string[];
  regressionIds: string[];
  progressionIds: string[];
  safety: SafetyMetadata;
}

export interface MatchCandidate {
  exercise: ExerciseDefinition;
  score: number;
  reasons: MatchReasonCode[];
}

/** Structured input to the exercise matching engine — every field here is
 * already-known, real athlete/session data; nothing is inferred at match time. */
export interface ExerciseMatchQuery {
  sourceExerciseId: string;
  intent: TrainingIntent[];
  availableEquipment: string[];
  /** Health-limitation tag ids the athlete reported — reused, not redefined. */
  injuryIds: string[];
  sport?: string;
  athleteLevel?: ExerciseDifficulty;
  /** True when the query is specifically for a bodyweight-only fallback
   * (travel, no-equipment adjustment) — hard-filters to equipment: []. */
  bodyweightOnly?: boolean;
  /** Deterministic preference/history signals, keyed by exercise id — see
   * domain/exercise/preferences.ts. Ranking-only, never a hard filter. */
  preferenceByExerciseId?: Record<string, ExercisePreferenceSignal>;
  recentlyUsedExerciseIds?: string[];
}

export type ExercisePreferenceSignal = 'liked' | 'disliked' | 'frequently_replaced' | 'frequently_skipped' | 'frequently_completed';
