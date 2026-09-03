/**
 * Daily Readiness System — shared types. Six structured 1-5 factors plus a
 * separate pain/injury flag feed a deterministic scoring function (see
 * engine/readinessEngine.ts); nothing here is inferred or generated.
 */

/** A closed 1-5 scale used uniformly by every readiness factor — same bounds,
 * same validation, same UI pattern, regardless of what each factor means. */
export type ReadinessScale = 1 | 2 | 3 | 4 | 5;

export interface DailyReadinessInputs {
  /** Subjective sleep quality: 1 = very poor, 5 = excellent. */
  sleepQuality: ReadinessScale;
  /** Sleep duration bucket: 1 = <5h, 2 = 5-6h, 3 = 6-7h, 4 = 7-8h, 5 = 8h+. */
  sleepDurationBucket: ReadinessScale;
  /** 1 = very low energy, 5 = very high energy. */
  energy: ReadinessScale;
  /** 1 = very low stress, 5 = very high stress (higher is worse). */
  stress: ReadinessScale;
  /** 1 = no soreness, 5 = very sore (higher is worse). */
  soreness: ReadinessScale;
  /** 1 = very low motivation, 5 = very high motivation. */
  motivation: ReadinessScale;
  /** New pain/injury concern reported today — handled as a safety override,
   * never folded into the numeric score itself. */
  painFlag: boolean;
  /** Athlete's own words, stored as context only — no engine ever reads this. */
  painNote?: string;
}

export type ReadinessStatus = 'high' | 'normal' | 'reduced' | 'recovery';

export interface ReadinessRecommendation {
  /** Human-readable, pre-templated coaching line — never generated. */
  message: string;
  /** True when today's session was actually modified from the base plan. */
  adjustmentApplied: boolean;
  /** Set only when adjustmentApplied — the same shape `applyCoachAdjustment` already
   * consumes elsewhere, so readiness reuses the existing adjustment mechanism. */
  trainingAdjustment?: {
    volumeMultiplier?: number;
    swapToBodyweight?: boolean;
    skipHighImpact?: boolean;
    note: string;
  };
  /** Human-readable "what changed" summary for the approval-style UI, e.g. "Volume reduced ~20%". */
  summary?: string;
}

export interface ReadinessResult {
  /** 0-100, bounded, deterministic, reproducible from the same inputs. */
  score: number;
  status: ReadinessStatus;
  /** The raw inputs this result was computed from, echoed back for display/audit. */
  factors: DailyReadinessInputs;
  recommendation: ReadinessRecommendation;
}

/** One persisted check-in per calendar date — a new day creates a new record;
 * resubmitting the same date overwrites that date's record (idempotent upsert),
 * the same pattern DayLog already uses for weight/meal logging. */
export interface DailyReadinessRecord {
  date: string; // local date key, YYYY-MM-DD
  inputs: DailyReadinessInputs;
  score: number;
  status: ReadinessStatus;
  recommendation: ReadinessRecommendation;
  /** Whether the athlete's Today's Workout actually applied the recommended adjustment
   * (it always does automatically for readiness — this exists for audit/history, and to
   * let a future "undo" surface honestly if ever added). */
  recommendationApplied: boolean;
  submittedAt: string; // ISO timestamp
}
