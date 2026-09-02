import type { AiCoachIntent, AiCoachReply } from './types';

/**
 * Deterministic AI Coach response table. The screen only ever offers a
 * fixed, closed set of quick-reply intents (see AiCoachIntent) — each
 * maps to a pre-written reply and a pre-defined plan adjustment. There is
 * no free-text generation and no external AI/LLM call; "AI Coach" is the
 * product's name for this rule engine, not a live model.
 */
export function getAiCoachReply(intent: AiCoachIntent): AiCoachReply {
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
  }
}
