import type { ExerciseCategory, FitnessLevel } from '../engine/types';
import type { ExerciseDifficulty, ImpactLevel, MovementPattern, TrainingIntent } from './types';

/**
 * Deterministic classification from an exercise's own generic data (name,
 * category, reps string, which levels/sports it's authored under) — the same
 * "infer from what's already there, never branch on identity at decision
 * time" philosophy `progressionModels.ts` already established for progression
 * models. These functions run ONCE, at library-build time, to derive
 * `ExerciseDefinition` fields for exercises that haven't been hand-curated
 * with more precise data — never inside the matching/progression engines
 * themselves, which only ever read the resulting data.
 */

const MOVEMENT_PATTERN_RULES: { pattern: RegExp; movementPattern: MovementPattern }[] = [
  { pattern: /squat/i, movementPattern: 'squat' },
  { pattern: /deadlift|good morning|\brdl\b|romanian/i, movementPattern: 'hinge' },
  { pattern: /lunge|split squat|step-?up/i, movementPattern: 'lunge' },
  { pattern: /overhead press|shoulder press|push press/i, movementPattern: 'vertical_push' },
  { pattern: /bench press|push-?up|floor press|dip/i, movementPattern: 'horizontal_push' },
  { pattern: /pull-?up|pulldown|pull-?down|chin-?up/i, movementPattern: 'vertical_pull' },
  { pattern: /\brow\b/i, movementPattern: 'horizontal_pull' },
  { pattern: /pallof|chop/i, movementPattern: 'anti_rotation' },
  { pattern: /side plank|side bend/i, movementPattern: 'anti_lateral_flexion' },
  { pattern: /plank|dead bug|hollow hold|ab wheel/i, movementPattern: 'anti_extension' },
  { pattern: /rotation|russian twist|woodchop/i, movementPattern: 'rotation' },
  { pattern: /carry|farmer/i, movementPattern: 'carry' },
  { pattern: /box jump|broad jump|\bjump\b/i, movementPattern: 'jump' },
  { pattern: /landing/i, movementPattern: 'landing' },
  { pattern: /sprint/i, movementPattern: 'sprint' },
  { pattern: /acceleration|first step/i, movementPattern: 'acceleration' },
  { pattern: /deceleration|braking/i, movementPattern: 'deceleration' },
  { pattern: /shuttle|change of direction|cutting|agility/i, movementPattern: 'change_of_direction' },
  { pattern: /balance|single-leg stand|bosu/i, movementPattern: 'balance' },
  { pattern: /stretch|mobility|warm up|cool down|joint circle/i, movementPattern: 'mobility' },
  { pattern: /freestyle|kick|pull buoy|drill|stroke|swim|sculling/i, movementPattern: 'technique' },
  { pattern: /jog|run|bike|treadmill|interval|conditioning|steady-state/i, movementPattern: 'conditioning' },
];

/** First matching rule wins; an exercise with no recognizable keyword falls back
 * to 'other' rather than a guessed pattern. */
export function classifyMovementPattern(name: string): MovementPattern {
  const match = MOVEMENT_PATTERN_RULES.find((rule) => rule.pattern.test(name));
  return match?.movementPattern ?? 'other';
}

const CATEGORY_INTENTS: Record<ExerciseCategory, TrainingIntent[]> = {
  warmup: ['mobility'],
  cooldown: ['mobility', 'recovery'],
  strength: ['strength', 'hypertrophy'],
  power: ['power', 'speed'],
  conditioning: ['conditioning', 'endurance'],
  technique: ['technique'],
};

export function classifyTrainingIntents(category: ExerciseCategory): TrainingIntent[] {
  return CATEGORY_INTENTS[category];
}

const LEVEL_ORDER: FitnessLevel[] = ['beginner', 'intermediate', 'advanced'];

/** The earliest fitness level an exercise is actually authored under — real
 * placement data, not a guess: an exercise the beginner program already uses
 * is beginner-appropriate regardless of whether advanced also uses it. */
export function classifyDifficulty(levelsSeen: Set<FitnessLevel>): ExerciseDifficulty {
  for (const level of LEVEL_ORDER) {
    if (levelsSeen.has(level)) return level;
  }
  return 'intermediate';
}

export function classifyImpactLevel(highImpact: boolean, category: ExerciseCategory): ImpactLevel {
  if (highImpact) return 'high';
  if (category === 'conditioning' || category === 'power') return 'moderate';
  return 'low';
}

const UNILATERAL_RE = /\/\s*(leg|side|arm)\b|single-leg|single-arm|bulgarian|split squat/i;

export function classifyUnilateral(name: string, reps: string): boolean {
  return UNILATERAL_RE.test(name) || UNILATERAL_RE.test(reps);
}

/** Slugifies a display name into a stable, URL/id-safe canonical id. Pure and
 * deterministic — the same name always produces the same id, which is what
 * lets exercises referenced from multiple places (a sport module slot, a
 * bodyweightAlternative, the legacy exerciseAlternatives table) resolve to
 * one shared ExerciseDefinition instead of silently duplicating. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
