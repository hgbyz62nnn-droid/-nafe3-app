import type {
  DailyReadinessInputs,
  ReadinessRecommendation,
  ReadinessResult,
  ReadinessScale,
  ReadinessStatus,
} from '../readiness/types';

/**
 * Daily Readiness Engine — deterministic scoring, no I/O, no randomness, no
 * external API. Same `DailyReadinessInputs` always produces the same
 * `ReadinessResult`; every threshold and weight below is a named constant so
 * the rule is auditable from the code itself rather than inferred at runtime.
 *
 * SCORING MODEL
 * Six 1-5 factors are normalized to 0-1 (inverting the two "higher is worse"
 * factors first), weighted, summed, and scaled to a 0-100 score:
 *
 *   normalized(v)      = (v - 1) / 4                          // 1..5 -> 0..1
 *   normalized(invert)  = (5 - v) / 4                          // stress/soreness: higher raw value = worse
 *   score = round(100 * sum(weight[f] * normalized(f)))
 *
 * FACTOR_WEIGHTS sum to 1 so `score` stays bounded to [0, 100] for any valid
 * combination of 1-5 inputs — no clamping is needed for the weighted sum
 * itself, though `clampScore` still guards against a corrupt/NaN weight edit.
 */

type PositiveFactorKey = 'sleepQuality' | 'sleepDurationBucket' | 'energy' | 'motivation';
type InvertedFactorKey = 'stress' | 'soreness';

/** Relative importance of each factor in the 0-100 readiness score. Energy carries the
 * most weight (the most direct same-day readiness signal); motivation the least (it
 * reflects intent more than physical capacity). Sums to exactly 1. */
export const FACTOR_WEIGHTS: Record<PositiveFactorKey | InvertedFactorKey, number> = {
  energy: 0.25,
  sleepQuality: 0.2,
  stress: 0.15,
  soreness: 0.15,
  sleepDurationBucket: 0.15,
  motivation: 0.1,
};

/** Score thresholds (inclusive lower bound) mapping the 0-100 score to a status —
 * before any pain/injury safety override is applied. A fully-neutral day (every
 * factor at its scale midpoint) scores exactly 50, which is deliberately `normal`:
 * an ordinary day with nothing notably good or bad should not read as reduced. */
export const STATUS_THRESHOLDS: { status: ReadinessStatus; minScore: number }[] = [
  { status: 'high', minScore: 80 },
  { status: 'normal', minScore: 50 },
  { status: 'reduced', minScore: 30 },
  { status: 'recovery', minScore: 0 },
];

function normalize(value: ReadinessScale, invert: boolean): number {
  const n = invert ? 5 - value : value - 1;
  return n / 4;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** The weighted 0-100 score for the 6 numeric factors, ignoring `painFlag`
 * (pain is a safety override handled separately, never folded into the score). */
export function computeReadinessScore(inputs: DailyReadinessInputs): number {
  const weighted =
    FACTOR_WEIGHTS.sleepQuality * normalize(inputs.sleepQuality, false) +
    FACTOR_WEIGHTS.sleepDurationBucket * normalize(inputs.sleepDurationBucket, false) +
    FACTOR_WEIGHTS.energy * normalize(inputs.energy, false) +
    FACTOR_WEIGHTS.stress * normalize(inputs.stress, true) +
    FACTOR_WEIGHTS.soreness * normalize(inputs.soreness, true) +
    FACTOR_WEIGHTS.motivation * normalize(inputs.motivation, false);
  return clampScore(weighted * 100);
}

function statusForScore(score: number): ReadinessStatus {
  const match = STATUS_THRESHOLDS.find((t) => score >= t.minScore);
  return match?.status ?? 'recovery';
}

/**
 * Maps a status to today's session adjustment — the SAME shape
 * `applyCoachAdjustment` already consumes (see planEngine.ts), reused rather
 * than duplicated. `high`/`normal` never modify the session; `reduced` and
 * `recovery` scale volume down (never change the sport/session's primary
 * intent), preserving the training goal per the deterministic rule below.
 */
function baseRecommendation(status: ReadinessStatus): ReadinessRecommendation {
  switch (status) {
    case 'high':
      return {
        message: "You're well recovered — today's session proceeds as planned.",
        adjustmentApplied: false,
      };
    case 'normal':
      return {
        message: 'Your readiness looks normal — today\'s session proceeds as planned.',
        adjustmentApplied: false,
      };
    case 'reduced':
      return {
        message:
          "Your readiness is a little lower today, so TRAINO trimmed today's volume while keeping your session's main focus.",
        adjustmentApplied: true,
        trainingAdjustment: { volumeMultiplier: 0.8, note: 'reduced volume for lower readiness' },
        summary: 'Volume reduced ~20%, main focus kept',
      };
    case 'recovery':
      return {
        message:
          "Your readiness is low today, so TRAINO made today's session recovery-oriented — lower volume with high-impact movements removed.",
        adjustmentApplied: true,
        trainingAdjustment: { volumeMultiplier: 0.6, skipHighImpact: true, note: 'recovery-oriented reduction' },
        summary: 'Volume reduced ~40%, high-impact movements removed',
      };
  }
}

/**
 * Pain/injury safety override (spec section 2): never a diagnosis, never an
 * automatic rehab prescription — a conservative session modification reusing
 * the exact same pain-safe adjustment the AI Coach's `have_pain` intent
 * already applies (skip high-impact, prefer bodyweight), plus a reduced
 * professional-evaluation nudge for anything status-worthy of concern.
 */
function painOverrideRecommendation(): ReadinessRecommendation {
  return {
    message:
      "TRAINO recommends modifying today's session because of the pain/discomfort you reported. High-impact and loaded movements have been removed and volume reduced as a precaution. If pain continues or feels severe, please check in with a medical professional before your next session.",
    adjustmentApplied: true,
    trainingAdjustment: {
      volumeMultiplier: 0.7,
      swapToBodyweight: true,
      skipHighImpact: true,
      note: 'pain-safe modification',
    },
    summary: 'High-impact movements removed, swapped to bodyweight, volume reduced',
  };
}

/**
 * Computes the full deterministic readiness result for one day's check-in.
 * `painFlag` is a safety override applied AFTER scoring: the numeric score
 * still reflects the 6 factors honestly (for display/history), but the
 * status is never better than `recovery` and the recommendation always uses
 * the conservative pain-safe adjustment above — pain is never averaged away
 * by an otherwise-good night's sleep or high motivation.
 */
export function computeReadiness(inputs: DailyReadinessInputs): ReadinessResult {
  const score = computeReadinessScore(inputs);
  const scoredStatus = statusForScore(score);
  const status: ReadinessStatus = inputs.painFlag ? 'recovery' : scoredStatus;
  const recommendation = inputs.painFlag ? painOverrideRecommendation() : baseRecommendation(status);

  return { score, status, factors: inputs, recommendation };
}
