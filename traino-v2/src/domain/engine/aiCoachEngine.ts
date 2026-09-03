import type { AiCoachIntent, AiCoachReply } from './types';
import type { WeeklyCoachingRecord } from '../coaching/types';
import type { DailyReadinessRecord } from '../readiness/types';
import { READINESS_STATUS_LABEL } from '../readiness/scales';

/** Structured context the Weekly Coaching / Daily Readiness intents below read from —
 * the most recently reviewed week's record and today's readiness check-in, if either
 * exists. Every reply built from these is a pre-templated string over already-
 * deterministic fields; nothing here generates or infers new text. */
export interface AiCoachReplyContext {
  latestRecord: WeeklyCoachingRecord | null;
  todayReadiness?: DailyReadinessRecord | null;
}

function barrierLabel(id: string): string {
  return id.replace(/_/g, ' ');
}

function factorSummary(record: DailyReadinessRecord): string {
  const { sleepQuality, energy, stress, soreness } = record.inputs;
  return `sleep ${sleepQuality}/5, energy ${energy}/5, stress ${stress}/5, soreness ${soreness}/5`;
}

/**
 * Fixed fallback for free-text input the composer doesn't map to one of
 * the known intents — this app has no live NLP/LLM, so free text can't
 * be understood; the honest response points back at what it can do.
 */
export function getFallbackReply(): AiCoachReply {
  return {
    message:
      "I can help most with the options above — tap a suggestion, or ask me to adjust today's workout, log pain, or check your nutrition.",
  };
}

/**
 * Deterministic AI Coach response table. The screen only ever offers a
 * fixed, closed set of quick-reply intents (see AiCoachIntent) — each
 * maps to a pre-written reply and a pre-defined plan adjustment. There is
 * no free-text generation and no external AI/LLM call; "AI Coach" is the
 * product's name for this rule engine, not a live model.
 */
export function getAiCoachReply(intent: AiCoachIntent, context?: AiCoachReplyContext): AiCoachReply {
  switch (intent) {
    case 'feeling_tired':
      return {
        message:
          "I understand. Let me adjust your plan based on your recovery and how you feel.",
        adjustment: { volumeMultiplier: 0.7, note: 'reduced volume for fatigue' },
        adjustmentSummary: ['Reduced training volume', 'Focused on quality', 'Optimized for recovery'],
        ctaLabel: 'VIEW UPDATED WORKOUT',
      };

    case 'adjust_todays_workout':
      return {
        message:
          "Sure — I can make today lighter or shorter. I've trimmed the volume and kept the key movements so you still get the main benefit.",
        adjustment: { volumeMultiplier: 0.8, note: 'trimmed volume on request' },
        adjustmentSummary: ['Reduced sets on secondary exercises', 'Kept primary lifts', 'Session shortened'],
        ctaLabel: 'VIEW UPDATED WORKOUT',
      };

    case 'have_pain':
      return {
        message:
          "Thanks for flagging that — I've removed high-impact and loaded movements from today's session. If pain continues, please check in with a medical professional before your next session.",
        adjustment: { skipHighImpact: true, swapToBodyweight: true, note: 'pain-safe substitution' },
        adjustmentSummary: ['Removed high-impact exercises', 'Swapped to low-load movements', 'Focus on mobility'],
        ctaLabel: 'VIEW UPDATED WORKOUT',
      };

    case 'traveling':
      return {
        message:
          "No problem — here's a bodyweight-only version of today's session so you can train without equipment.",
        adjustment: { swapToBodyweight: true, note: 'equipment-free substitution' },
        adjustmentSummary: ['Swapped to bodyweight equivalents', 'Same structure and focus', 'No equipment needed'],
        ctaLabel: 'VIEW UPDATED WORKOUT',
      };

    case 'replace_exercise':
      return {
        message:
          "Tell me which exercise, and I'll swap it for an equivalent movement that targets the same muscles.",
        ctaLabel: 'CHOOSE EXERCISE',
      };

    case 'missed_workout':
      return {
        message:
          "That's alright — one missed session won't set you back. I've kept your plan as is; just pick up with today's session and we'll stay on track for the week.",
        adjustmentSummary: ['Plan unchanged', 'Resume with today\'s session'],
      };

    case 'ask_about_nutrition':
      return {
        message:
          "Your nutrition targets are based on your weight, activity level, and goal. Check the Nutrition tab for today's calorie and macro breakdown, or ask me about a specific meal.",
        ctaLabel: 'OPEN NUTRITION',
      };

    case 'why_consistency_dropped': {
      const record = context?.latestRecord;
      if (!record?.decision) {
        return {
          message:
            "I don't have a full week of logged data yet to explain a consistency change — keep logging your sessions and I'll break it down after your next weekly review.",
        };
      }
      const { decision } = record;
      return {
        message: decision.barrier
          ? `Your consistency was mainly affected by ${barrierLabel(decision.barrier)}. ${decision.evidence}.`
          : `Nothing specific stood out — ${decision.evidence}.`,
        ctaLabel: 'VIEW WEEKLY REPORT',
      };
    }

    case 'whats_next_week_change': {
      const record = context?.latestRecord;
      if (!record?.decision || !record.decision.proposedChanges) {
        return { message: "No changes are planned for next week right now — your current plan stays as is." };
      }
      return {
        message: `${record.decision.reason} ${record.decision.proposedChanges.summary}.`,
        ctaLabel: record.approvalStatus === 'pending' ? 'VIEW WEEKLY REPORT' : undefined,
      };
    }

    case 'why_workout_reduced': {
      const readiness = context?.todayReadiness;
      if (readiness?.recommendationApplied) {
        return {
          message: `${readiness.recommendation.message} (${factorSummary(readiness)}).`,
          ctaLabel: 'VIEW TODAY\'S WORKOUT',
        };
      }
      const record = context?.latestRecord;
      if (!record?.decision || record.approvalStatus !== 'approved') {
        return {
          message:
            "TRAINO hasn't reduced your plan through weekly coaching or today's readiness — if today's session looks different, check whether an AI Coach chat adjustment is still active.",
        };
      }
      return {
        message: `TRAINO adjusted next week because of ${barrierLabel(decisionBarrier(record))}: ${record.decision.evidence}. ${record.decision.reason}`,
      };
    }

    case 'how_ready_am_i': {
      const readiness = context?.todayReadiness;
      if (!readiness) {
        return {
          message: "You haven't checked in today yet — a quick check-in takes under a minute and helps me shape today's session.",
          ctaLabel: 'CHECK IN',
        };
      }
      return {
        message: `Today's readiness: ${readiness.score}% — ${READINESS_STATUS_LABEL[readiness.status]}. Based on ${factorSummary(readiness)}. ${readiness.recommendation.message}`,
        ctaLabel: 'VIEW TODAY\'S WORKOUT',
      };
    }

    case 'should_i_train_today': {
      const readiness = context?.todayReadiness;
      if (!readiness) {
        return {
          message: "Check in first and I can give you a straight answer based on how you're actually feeling today.",
          ctaLabel: 'CHECK IN',
        };
      }
      if (readiness.inputs.painFlag) {
        return {
          message:
            "You can train, but keep it conservative — TRAINO already removed high-impact and loaded movements from today's session because of the pain you reported. If pain continues, check in with a medical professional first.",
          ctaLabel: 'VIEW TODAY\'S WORKOUT',
        };
      }
      switch (readiness.status) {
        case 'high':
        case 'normal':
          return { message: "Yes — your readiness looks good. Go ahead with today's planned session.", ctaLabel: 'VIEW TODAY\'S WORKOUT' };
        case 'reduced':
          return {
            message: "You can train — TRAINO already trimmed today's volume based on your readiness, so take it a bit easier than usual.",
            ctaLabel: 'VIEW TODAY\'S WORKOUT',
          };
        case 'recovery':
          return {
            message:
              "I'd keep today light. Your readiness is low, so today's session has been made recovery-oriented — if you still don't feel up to it, resting today is a reasonable call.",
            ctaLabel: 'VIEW TODAY\'S WORKOUT',
          };
      }
    }
  }
}

function decisionBarrier(record: WeeklyCoachingRecord): string {
  return record.decision?.barrier ?? 'a detected pattern';
}
