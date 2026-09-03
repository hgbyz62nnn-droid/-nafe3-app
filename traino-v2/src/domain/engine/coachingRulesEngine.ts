import type { BudgetTier, UserProfile } from './types';
import type { BarrierId } from '../coaching/barriers';
import type { CoachingActionType, CoachingDecision, DetectedBarrier, PlanArea, ProposedChanges } from '../coaching/types';
import type { WeekSummary } from '../coaching/types';
import { getSportModule } from '../sports/registry';

/**
 * Deterministic coaching-rule system. One function, `buildCoachingDecision`,
 * maps a detected barrier onto a fixed, documented rule — never generated,
 * never sport-specific. Every `proposedChanges` value is expressed purely
 * in terms of fields the engine already knows how to apply:
 *
 *   - `trainingAdjustment` -> the existing `AiCoachAdjustment`, applied via
 *     the existing `applyCoachAdjustment` (the same mechanism the AI Coach
 *     screen already uses for "feeling tired" / "traveling" / "have pain").
 *   - `daysAvailablePerWeek` / `budgetTier` -> a direct, athlete-approved
 *     write via the existing `updateAnswers`.
 *
 * No new plan-representation concept was introduced to build this.
 */

const TIME_BARRIER_VOLUME_MULTIPLIER = 0.65;
const FATIGUE_VOLUME_MULTIPLIER = 0.7;
const DIFFICULTY_VOLUME_MULTIPLIER = 0.85;
const MIN_SESSIONS_PER_WEEK = 2;
/** Below this average session length, cutting duration further isn't meaningful —
 * reduce frequency instead of squeezing an already-short session. */
const MIN_AVG_DURATION_FOR_DURATION_CUT = 30;

const BUDGET_TIER_ORDER: BudgetTier[] = ['low', 'medium', 'high'];

function averageDurationForLevel(profile: UserProfile): number {
  const days = getSportModule(profile.answers.sport).program[profile.level];
  if (days.length === 0) return 0;
  const total = days.reduce((sum, d) => sum + d.durationMin, 0);
  return Math.round(total / days.length);
}

interface RuleOutcome {
  recommendedAction: CoachingActionType;
  affectedPlanArea: PlanArea;
  proposedChanges: ProposedChanges | null;
  reason: string;
  requiresApproval: boolean;
}

function ruleFor(barrier: BarrierId, summary: WeekSummary, profile: UserProfile): RuleOutcome {
  switch (barrier) {
    case 'time':
    case 'work_study': {
      const avgDuration = averageDurationForLevel(profile);
      if (avgDuration > MIN_AVG_DURATION_FOR_DURATION_CUT) {
        const newDuration = Math.max(Math.round(avgDuration * TIME_BARRIER_VOLUME_MULTIPLIER), 20);
        return {
          recommendedAction: 'REDUCE_SESSION_DURATION',
          affectedPlanArea: 'training',
          proposedChanges: {
            trainingAdjustment: { volumeMultiplier: TIME_BARRIER_VOLUME_MULTIPLIER, note: 'reduced for limited time' },
            summary: `~${avgDuration} min -> ~${newDuration} min`,
          },
          reason: 'Session length was inconsistent with reported time availability.',
          requiresApproval: true,
        };
      }
      const newFreq = Math.max(profile.answers.daysAvailablePerWeek - 1, MIN_SESSIONS_PER_WEEK);
      return {
        recommendedAction: 'REDUCE_FREQUENCY',
        affectedPlanArea: 'training',
        proposedChanges: {
          daysAvailablePerWeek: newFreq,
          summary: `${profile.answers.daysAvailablePerWeek} days/week -> ${newFreq} days/week`,
        },
        reason: 'Sessions are already short — reducing weekly frequency preserves quality per session instead.',
        requiresApproval: newFreq !== profile.answers.daysAvailablePerWeek,
      };
    }

    case 'schedule_conflict': {
      // No day-specific rescheduling exists in this app's plan engine (each day is
      // resolved by real day-of-week, not an athlete-assigned slot) — "redistribute"
      // is implemented honestly as stepping the weekly target down to what the
      // athlete actually demonstrated they could sustain, rather than pretending to
      // move a missed Monday session onto Tuesday.
      const realisticFreq = Math.max(summary.workoutsCompleted + 1, MIN_SESSIONS_PER_WEEK);
      const newFreq = Math.min(realisticFreq, profile.answers.daysAvailablePerWeek);
      return {
        recommendedAction: 'REDISTRIBUTE_SESSIONS',
        affectedPlanArea: 'training',
        proposedChanges: {
          daysAvailablePerWeek: newFreq,
          summary: `${profile.answers.daysAvailablePerWeek} days/week -> ${newFreq} days/week`,
        },
        reason: 'A one-off conflict disrupted this week — next week targets a session count you actually completed.',
        requiresApproval: newFreq !== profile.answers.daysAvailablePerWeek,
      };
    }

    case 'poor_sleep':
    case 'fatigue':
    case 'stress':
      return {
        recommendedAction: 'REDUCE_VOLUME_INTENSITY',
        affectedPlanArea: 'training',
        proposedChanges: {
          trainingAdjustment: { volumeMultiplier: FATIGUE_VOLUME_MULTIPLIER, note: 'reduced for recovery' },
          summary: 'Training volume reduced ~30% next week',
        },
        reason: 'Recovery signals were low this week — reducing load protects consistency.',
        requiresApproval: true,
      };

    case 'workout_difficulty':
      return {
        recommendedAction: 'REDUCE_VOLUME_INTENSITY',
        affectedPlanArea: 'training',
        proposedChanges: {
          trainingAdjustment: { volumeMultiplier: DIFFICULTY_VOLUME_MULTIPLIER, note: 'reduced for difficulty' },
          summary: 'Training volume reduced ~15% next week',
        },
        reason: 'Sessions were reported as too difficult — easing volume should help completion.',
        requiresApproval: true,
      };

    case 'lack_of_equipment':
      return {
        recommendedAction: 'SWAP_TO_EQUIPMENT_FREE',
        affectedPlanArea: 'training',
        proposedChanges: {
          trainingAdjustment: { swapToBodyweight: true, note: 'equipment-free substitution' },
          summary: 'Equipment-based exercises swapped for bodyweight alternatives',
        },
        reason: 'Equipment access was reported as a barrier — next week uses the existing bodyweight substitutes.',
        requiresApproval: true,
      };

    case 'travel':
      return {
        recommendedAction: 'ACTIVATE_TRAVEL_MODE',
        affectedPlanArea: 'training',
        proposedChanges: {
          trainingAdjustment: { swapToBodyweight: true, note: 'travel adjustment' },
          summary: 'Bodyweight-only sessions for the week',
        },
        reason: 'Travel was reported this week — next week is fully equipment-free, the same substitution the AI Coach already offers for travel.',
        requiresApproval: true,
      };

    case 'injury_pain':
      return {
        recommendedAction: 'PAIN_SAFE_ADJUSTMENT',
        affectedPlanArea: 'training',
        proposedChanges: {
          trainingAdjustment: { skipHighImpact: true, swapToBodyweight: true, note: 'pain-safe adjustment' },
          summary: 'High-impact and loaded movements removed next week',
        },
        reason: 'Pain was reported during training — next week removes high-impact and loaded movements using the existing safety system.',
        requiresApproval: true,
      };

    case 'nutrition_difficulty':
    case 'budget': {
      const currentTier = profile.answers.budgetTier;
      const idx = BUDGET_TIER_ORDER.indexOf(currentTier);
      if (idx > 0) {
        const newTier = BUDGET_TIER_ORDER[idx - 1];
        return {
          recommendedAction: 'SIMPLIFY_NUTRITION',
          affectedPlanArea: 'nutrition',
          proposedChanges: { budgetTier: newTier, summary: `Meal budget simplified: ${currentTier} -> ${newTier}` },
          reason: 'Nutrition adherence was low this week — next week uses simpler, lower-cost meal options already in the library.',
          requiresApproval: true,
        };
      }
      return {
        recommendedAction: 'MAINTAIN_PLAN',
        affectedPlanArea: 'none',
        proposedChanges: null,
        reason: 'Meal options are already at the simplest budget tier available.',
        requiresApproval: false,
      };
    }

    case 'motivation':
    case 'other':
    default:
      // Deliberately conservative: no medical/psychological claim, no structural plan
      // change proposed — only an adherence-oriented note, per the explicit constraint
      // on the motivation barrier.
      return {
        recommendedAction: 'MAINTAIN_PLAN',
        affectedPlanArea: 'none',
        proposedChanges: null,
        reason: 'No structural change is recommended — consistency next week matters more than intensity.',
        requiresApproval: false,
      };
  }
}

/** Builds the full structured coaching decision for the week. `primary` is the
 * strongest detected barrier (see barrierEngine.pickPrimaryBarrier), or null on a
 * clean week — in which case no rule fires and no plan change is proposed. */
export function buildCoachingDecision(
  primary: DetectedBarrier | null,
  summary: WeekSummary,
  profile: UserProfile,
  recurring: { isRecurring: boolean; recurringWeeks: number }
): CoachingDecision {
  if (!primary) {
    return {
      barrier: null,
      severity: 'low',
      evidence: summary.hasData ? `${summary.completionPct}% of planned sessions completed` : 'no activity logged this week',
      confidence: summary.hasData ? 'high' : 'low',
      recommendedAction: 'NO_ACTION_NEEDED',
      affectedPlanArea: 'none',
      proposedChanges: null,
      reason: summary.hasData
        ? 'This week met the plan — no changes needed.'
        : 'Not enough logged data this week to make a recommendation.',
      requiresApproval: false,
      isRecurring: false,
      recurringWeeks: 0,
    };
  }

  const outcome = ruleFor(primary.barrier, summary, profile);
  return {
    barrier: primary.barrier,
    severity: primary.severity,
    evidence: primary.evidence,
    confidence: primary.confidence,
    recommendedAction: outcome.recommendedAction,
    affectedPlanArea: outcome.affectedPlanArea,
    proposedChanges: outcome.proposedChanges,
    reason: outcome.reason,
    requiresApproval: outcome.requiresApproval,
    isRecurring: recurring.isRecurring,
    recurringWeeks: recurring.recurringWeeks,
  };
}
