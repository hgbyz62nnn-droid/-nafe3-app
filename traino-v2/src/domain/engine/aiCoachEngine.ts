import type { AiCoachIntent, AiCoachReply, NutritionTargets } from './types';
import type { WeeklyCoachingRecord } from '../coaching/types';
import type { DailyReadinessRecord } from '../readiness/types';
import type { ExerciseProgressionDecision } from '../progression/types';
import type { ExerciseDefinition } from '../exercise/types';
import type { DailyNutritionPlan, FoodDefinition, MealRole } from '../nutrition/types';
import type { DetailedNutritionAdherence } from '../nutrition/adherence';
import { READINESS_STATUS_LABEL } from '../readiness/scales';
import { getExerciseByName, getProgressions, getRegressions } from '../exercise/registry';
import { suggestReplacements, type AthleteConstraints } from '../exercise/matchingEngine';
import { formatEnumLabel, MATCH_REASON_LABELS } from '../exercise/labels';
import { getFood } from '../nutrition/registry';
import { suggestFoodAlternatives, type FoodAthleteConstraints } from '../nutrition/matchingEngine';
import { FOOD_MATCH_REASON_LABELS } from '../nutrition/labels';

/** Structured context the Weekly Coaching / Daily Readiness / Progression / Exercise
 * Intelligence intents below read from — the most recently reviewed week's record,
 * today's readiness check-in, today's resolved workout's per-exercise progression
 * decisions, and (for the exercise-intelligence intents) which exercise the athlete is
 * asking about plus their real equipment/injury/sport/level constraints. Every reply
 * built from these is a pre-templated string over already-deterministic fields; nothing
 * here generates or infers new text. */
export interface AiCoachReplyContext {
  latestRecord: WeeklyCoachingRecord | null;
  todayReadiness?: DailyReadinessRecord | null;
  /** `ResolvedExercise.progression` for every progressable exercise in today's workout,
   * in plan order — the raw material the progression intents below pick from. */
  todaysProgressionDecisions?: ExerciseProgressionDecision[];
  /** The exercise the exercise-intelligence intents below are about — set when the
   * athlete reached AI Coach from a specific exercise's detail view (see
   * ExerciseDetailPanel's "Ask AI Coach" button). Omitted falls back to the first
   * progressable exercise in today's workout, the same "notable pick" pattern the
   * progression intents above already use. */
  focusedExerciseName?: string;
  /** The athlete's real equipment/injury/sport/level constraints — required for the
   * replacement-ranking exercise-intelligence intents (replace_exercise,
   * why_limited_alternatives). */
  athleteConstraints?: AthleteConstraints;
  /** Today's generated Daily Nutrition Plan, if one has been built — the raw material
   * for 'what_should_i_eat_today' and the fallback focused-food pick below. */
  dailyPlan?: DailyNutritionPlan;
  /** The athlete's estimated daily calorie/macro targets (domain/engine/nutritionEngine.ts). */
  nutritionTargets?: NutritionTargets;
  /** The food a nutrition-intelligence intent is about — set when the athlete reached
   * AI Coach from a specific food's detail view. Omitted falls back to the first food
   * in today's plan, the same "notable pick" pattern the exercise intents use. */
  focusedFoodId?: string;
  /** Which meal role the focused food fills — required to rank real replacement
   * candidates (a carb alternative, not a random food). Falls back to the food's own
   * first mealRole when omitted. */
  focusedFoodRole?: MealRole;
  foodAthleteConstraints?: FoodAthleteConstraints;
  /** This week's detailed nutrition adherence (domain/nutrition/adherence.ts). */
  nutritionAdherence?: DetailedNutritionAdherence;
}

/** Resolves which exercise an exercise-intelligence intent is about: the explicitly
 * focused one if it's in the library, else the first of today's progressable exercises
 * that resolves — never guessed from free text (there isn't any). */
function resolveFocusedExercise(context?: AiCoachReplyContext): ExerciseDefinition | null {
  if (context?.focusedExerciseName) {
    const def = getExerciseByName(context.focusedExerciseName);
    if (def) return def;
  }
  for (const decision of context?.todaysProgressionDecisions ?? []) {
    const def = getExerciseByName(decision.exerciseName);
    if (def) return def;
  }
  return null;
}

const NO_FOCUSED_EXERCISE_REPLY: AiCoachReply = {
  message: "I don't have a specific exercise in view right now — open an exercise's details and ask me from there.",
};

/** Resolves which food a nutrition-intelligence intent is about: the explicitly
 * focused one if it's in the library, else the first food in today's plan — never
 * guessed from free text. */
function resolveFocusedFood(context?: AiCoachReplyContext): FoodDefinition | null {
  if (context?.focusedFoodId) {
    const def = getFood(context.focusedFoodId);
    if (def) return def;
  }
  const firstItem = context?.dailyPlan?.meals.find((m) => m.items.length > 0)?.items[0];
  if (firstItem) {
    const def = getFood(firstItem.foodId);
    if (def) return def;
  }
  return null;
}

const NO_FOCUSED_FOOD_REPLY: AiCoachReply = {
  message: "I don't have a specific food in view right now — open a food's details and ask me from there.",
};

function barrierLabel(id: string): string {
  return id.replace(/_/g, ' ');
}

function factorSummary(record: DailyReadinessRecord): string {
  const { sleepQuality, energy, stress, soreness } = record.inputs;
  return `sleep ${sleepQuality}/5, energy ${energy}/5, stress ${stress}/5, soreness ${soreness}/5`;
}

function describeTarget(decision: ExerciseProgressionDecision, target: ExerciseProgressionDecision['nextTarget']): string {
  if (!target) return 'no target set yet';
  switch (decision.model) {
    case 'load':
      return target.loadKg !== undefined ? `${target.reps} reps @ ${target.loadKg}kg` : `${target.reps} reps`;
    case 'rep_range':
      return `${target.reps} reps`;
    case 'distance':
      return `${target.distanceM}m`;
    case 'duration':
      return `${target.durationSec} sec`;
    case 'technique':
      return `${target.sets} sets (consistency-based)`;
  }
}

/** The single most notable progression decision from today's workout to explain, when
 * an intent doesn't ask about one specific exercise: a real PROGRESS/REGRESS change if
 * one exists, otherwise the first progressable exercise at all. Deterministic — always
 * the same pick for the same decisions array (plan order). */
function notableDecision(decisions: ExerciseProgressionDecision[] | undefined): ExerciseProgressionDecision | null {
  if (!decisions || decisions.length === 0) return null;
  return decisions.find((d) => d.decision === 'PROGRESS' || d.decision === 'REGRESS') ?? decisions[0];
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

    case 'replace_exercise': {
      const ex = resolveFocusedExercise(context);
      const constraints = context?.athleteConstraints;
      if (!ex || !constraints) {
        return {
          message:
            "Tell me which exercise, and I'll swap it for an equivalent movement that targets the same muscles.",
          ctaLabel: 'CHOOSE EXERCISE',
        };
      }
      const top = suggestReplacements(ex.id, constraints, 1)[0];
      if (!top) {
        return { message: `I don't have a safe, available alternative for ${ex.displayName} right now — check its details for what's ruling options out.` };
      }
      const reasons = top.reasons.slice(0, 2).map((r) => MATCH_REASON_LABELS[r].toLowerCase());
      return {
        message: `For ${ex.displayName}, try ${top.exercise.displayName} — ${reasons.join(' and ')}.`,
        ctaLabel: 'CHOOSE EXERCISE',
      };
    }

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

    case 'why_weight_increased': {
      const loadBump = context?.todaysProgressionDecisions?.find(
        (d) => d.model === 'load' && d.decision === 'PROGRESS' && d.nextTarget?.loadKg !== undefined && d.nextTarget.loadKg !== d.previousTarget?.loadKg
      );
      if (!loadBump) {
        return { message: "Your load hasn't increased recently — ask me why after your next logged session if you're expecting a change." };
      }
      return {
        message: `${loadBump.reason} Next target: ${describeTarget(loadBump, loadBump.nextTarget)}.`,
        ctaLabel: 'VIEW TODAY\'S WORKOUT',
      };
    }

    case 'why_no_progression': {
      const held = context?.todaysProgressionDecisions?.find(
        (d) => d.decision === 'MAINTAIN' || d.decision === 'HOLD' || d.decision === 'REGRESS'
      );
      if (!held) {
        const decisions = context?.todaysProgressionDecisions ?? [];
        if (decisions.length === 0) {
          return { message: "I don't have enough logged history yet to tell — log a few sessions and I'll be able to explain your progression." };
        }
        return { message: "Everything's actually progressing well right now — nothing is being held back." };
      }
      return { message: held.reason };
    }

    case 'whats_changed_from_last_week': {
      const decision = notableDecision(context?.todaysProgressionDecisions);
      if (!decision || decision.decision === 'SKIP') {
        return { message: "Nothing's changed from your last logged session — keep logging and I'll track it for you." };
      }
      if (decision.decision === 'HOLD' || decision.decision === 'MAINTAIN') {
        return { message: `${decision.exerciseName} is unchanged from last time — ${decision.reason.toLowerCase()}` };
      }
      const from = decision.previousTarget ? describeTarget(decision, decision.previousTarget) : 'your last target';
      const to = describeTarget(decision, decision.nextTarget);
      return { message: `${decision.exerciseName}: ${from} -> ${to}. ${decision.reason}`, ctaLabel: 'VIEW TODAY\'S WORKOUT' };
    }

    case 'what_should_i_aim_for': {
      const decision = notableDecision(context?.todaysProgressionDecisions);
      if (!decision || !decision.nextTarget) {
        return { message: "I don't have a target for you yet — log today's session and I'll set one for next time." };
      }
      return {
        message: `For ${decision.exerciseName}, aim for ${describeTarget(decision, decision.nextTarget)} next time.`,
        ctaLabel: 'VIEW TODAY\'S WORKOUT',
      };
    }

    case 'why_this_exercise': {
      const ex = resolveFocusedExercise(context);
      if (!ex) return NO_FOCUSED_EXERCISE_REPLY;
      const focus = ex.trainingIntents.length > 0 ? ex.trainingIntents.map(formatEnumLabel).join('/') : 'your training focus';
      const muscles = ex.primaryMuscles.length > 0 ? ` It targets your ${ex.primaryMuscles.map(formatEnumLabel).join(', ')}.` : '';
      return { message: `${ex.displayName} is in your plan because it builds ${focus} through a ${formatEnumLabel(ex.movementPattern)} movement.${muscles}` };
    }

    case 'what_muscles_does_this_train': {
      const ex = resolveFocusedExercise(context);
      if (!ex) return NO_FOCUSED_EXERCISE_REPLY;
      if (ex.primaryMuscles.length === 0) {
        return { message: `I don't have detailed muscle data for ${ex.displayName} yet.` };
      }
      const secondary = ex.secondaryMuscles.length > 0 ? ` It also works your ${ex.secondaryMuscles.map(formatEnumLabel).join(', ')}.` : '';
      return { message: `${ex.displayName} primarily works your ${ex.primaryMuscles.map(formatEnumLabel).join(', ')}.${secondary}` };
    }

    case 'easier_version': {
      const ex = resolveFocusedExercise(context);
      if (!ex) return NO_FOCUSED_EXERCISE_REPLY;
      const easier = getRegressions(ex.id)[0];
      if (!easier) {
        return { message: `There's no simpler pre-defined version of ${ex.displayName} in TRAINO yet — try reducing sets or reps instead.` };
      }
      return { message: `An easier version of ${ex.displayName} is ${easier.displayName}.`, ctaLabel: 'VIEW TODAY\'S WORKOUT' };
    }

    case 'harder_version': {
      const ex = resolveFocusedExercise(context);
      if (!ex) return NO_FOCUSED_EXERCISE_REPLY;
      const harder = getProgressions(ex.id)[0];
      if (!harder) {
        return { message: `There's no harder pre-defined progression from ${ex.displayName} in TRAINO yet — try adding load or reps instead.` };
      }
      return { message: `A harder version of ${ex.displayName} is ${harder.displayName}.`, ctaLabel: 'VIEW TODAY\'S WORKOUT' };
    }

    case 'why_limited_alternatives': {
      const ex = resolveFocusedExercise(context);
      const constraints = context?.athleteConstraints;
      if (!ex || !constraints) {
        return { message: "Replacement options depend on your available equipment and any injuries on file — check your profile if something's missing." };
      }
      const reasons: string[] = [];
      if (constraints.availableEquipment.length === 0) {
        reasons.push("you haven't set any equipment as available, so only bodyweight movements qualify");
      }
      const realInjuries = constraints.injuryIds.filter((id) => id !== 'none');
      if (realInjuries.length > 0) {
        reasons.push(`movements that conflict with your reported ${realInjuries.map(formatEnumLabel).join('/')} limitation are excluded for safety`);
      }
      if (reasons.length === 0) {
        return { message: 'Every safe, equipment-compatible alternative is already shown — nothing is being held back.' };
      }
      return { message: `Some alternatives aren't shown because ${reasons.join(', and ')}.` };
    }

    case 'what_should_i_eat_today': {
      const plan = context?.dailyPlan;
      if (!plan || plan.meals.length === 0) {
        return { message: "I don't have today's plan ready yet — open Nutrition to generate it.", ctaLabel: 'OPEN NUTRITION' };
      }
      const mealSummaries = plan.meals
        .filter((m) => m.items.length > 0)
        .map((m) => `${m.slotLabel}: ${m.items.map((i) => getFood(i.foodId)?.displayName ?? i.foodId).join(', ')}`)
        .join('. ');
      return { message: `Today's plan is about ${plan.totals.calories} kcal. ${mealSummaries}.`, ctaLabel: 'OPEN NUTRITION' };
    }

    case 'what_are_my_calories': {
      const targets = context?.nutritionTargets;
      if (!targets) {
        return { message: "I don't have your nutrition targets calculated yet — complete your assessment first." };
      }
      return {
        message: `Your estimated daily target is ${targets.calories} kcal — ${targets.proteinG}g protein, ${targets.carbsG}g carbs, ${targets.fatG}g fat.`,
        ctaLabel: 'OPEN NUTRITION',
      };
    }

    case 'why_these_foods': {
      const food = resolveFocusedFood(context);
      if (!food) return NO_FOCUSED_FOOD_REPLY;
      const roles = food.mealRoles.map(formatEnumLabel).join('/');
      const diet = formatEnumLabel(food.dietaryTags[0] ?? 'no_restriction');
      return {
        message: `${food.displayName} is in your plan as a ${roles} source that fits your ${diet} preference and your calorie/macro target for that meal.`,
      };
    }

    case 'replace_food': {
      const food = resolveFocusedFood(context);
      const constraints = context?.foodAthleteConstraints;
      if (!food || !constraints) {
        return { message: "Tell me which food, and I'll suggest a practical alternative that fits your diet, budget, and today's target." };
      }
      const role = context?.focusedFoodRole ?? food.mealRoles[0];
      const top = suggestFoodAlternatives(food.id, role, constraints, 1)[0];
      if (!top) {
        return { message: `I don't have a safe, compatible alternative for ${food.displayName} right now — check its details for what's ruling options out.` };
      }
      const reasons = top.reasons.slice(0, 2).map((r) => FOOD_MATCH_REASON_LABELS[r].toLowerCase());
      return {
        message: `For ${food.displayName}, try ${top.food.displayName} — ${reasons.join(' and ')}.`,
        ctaLabel: 'OPEN NUTRITION',
      };
    }

    case 'how_is_my_nutrition_this_week': {
      const adherence = context?.nutritionAdherence;
      if (!adherence || adherence.isIncomplete) {
        return {
          message: "I don't have enough detailed food logging this week to break it down — log a few meals with quantities and I'll be able to tell you more.",
        };
      }
      return {
        message: `This week: about ${adherence.caloriesAdherencePct}% of your calorie target and ${adherence.proteinAdherencePct}% of your protein target on average, with ${adherence.mealCompletionPct}% of meals logged.`,
        ctaLabel: 'VIEW WEEKLY REPORT',
      };
    }
  }
}

function decisionBarrier(record: WeeklyCoachingRecord): string {
  return record.decision?.barrier ?? 'a detected pattern';
}
