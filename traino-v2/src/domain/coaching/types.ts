import type { AiCoachAdjustment, BudgetTier } from '../engine/types';
import type { BarrierId } from './barriers';

/**
 * Weekly Coaching Loop — shared types. Every value here is either athlete
 * input, a real computed number, or a lookup into a predefined rule table;
 * nothing is generated. See engine/barrierEngine.ts, engine/coachingRulesEngine.ts
 * and engine/weeklyCoachingEngine.ts for the logic that produces these.
 */

export type Severity = 'low' | 'medium' | 'high';
export type Confidence = 'low' | 'medium' | 'high';

export interface WeeklyCheckIn {
  barrierIds: BarrierId[];
  /** Stored as athlete context only — no engine or coaching rule ever reads this field. */
  note?: string;
  submittedAt: string;
}

/** The closed set of deterministic actions a coaching rule can recommend. Each maps to
 * a concrete, already-existing engine mechanism (see coachingRulesEngine.ts) — this is
 * not an open vocabulary a rule can invent from. */
export type CoachingActionType =
  | 'NO_ACTION_NEEDED'
  | 'MAINTAIN_PLAN'
  | 'REDUCE_SESSION_DURATION'
  | 'REDUCE_FREQUENCY'
  | 'REDUCE_VOLUME_INTENSITY'
  | 'REDISTRIBUTE_SESSIONS'
  | 'SWAP_TO_EQUIPMENT_FREE'
  | 'ACTIVATE_TRAVEL_MODE'
  | 'SIMPLIFY_NUTRITION'
  | 'PAIN_SAFE_ADJUSTMENT';

export type PlanArea = 'training' | 'nutrition' | 'none';

/** What a recommendation actually changes, expressed entirely in terms of fields the
 * engine already knows how to apply: `trainingAdjustment` goes through the existing
 * `applyCoachAdjustment`, `daysAvailablePerWeek`/`budgetTier` go through the existing
 * `updateAnswers`. No new plan-representation concept was introduced for this feature. */
export interface ProposedChanges {
  trainingAdjustment?: AiCoachAdjustment;
  daysAvailablePerWeek?: number;
  budgetTier?: BudgetTier;
  /** Human-readable "before -> after" summary for the approval UI, e.g. "60 min -> 40 min". */
  summary: string;
}

export interface DetectedBarrier {
  barrier: BarrierId;
  severity: Severity;
  confidence: Confidence;
  evidence: string;
  explicitlySelected: boolean;
  objectiveSignal: boolean;
}

export interface CoachingDecision {
  barrier: BarrierId | null;
  severity: Severity;
  evidence: string;
  confidence: Confidence;
  recommendedAction: CoachingActionType;
  affectedPlanArea: PlanArea;
  proposedChanges: ProposedChanges | null;
  reason: string;
  requiresApproval: boolean;
  isRecurring: boolean;
  recurringWeeks: number;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'not_applicable';

export interface WeeklyCoachingRecord {
  /** The plan week (1-indexed, matches progressionEngine's currentPlanWeek) this record reviews. */
  reviewedPlanWeek: number;
  /** The plan week a decision, once approved, takes effect on — always reviewedPlanWeek + 1. */
  appliesFromPlanWeek: number;
  weekStartDateKey: string;
  checkIn: WeeklyCheckIn | null;
  decision: CoachingDecision | null;
  approvalStatus: ApprovalStatus;
  decidedAt: string | null;
}

/** Real, honestly-empty-when-absent weekly data — never fabricated. `hasData` is false
 * only when nothing at all was logged for the week (no workouts, no meals, no weight). */
export interface WeekSummary {
  hasData: boolean;
  workoutsPlanned: number;
  workoutsCompleted: number;
  workoutsMissed: number;
  completionPct: number;
  nutritionAdherencePct: number;
  recoveryScore: number;
  weightDeltaKg: number;
  hasWeightData: boolean;
}
