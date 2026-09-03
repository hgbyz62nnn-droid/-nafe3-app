import { describe, expect, it } from 'vitest';
import { getAiCoachReply, getFallbackReply } from './aiCoachEngine';
import { computeReadiness } from './readinessEngine';
import type { AiCoachIntent } from './types';
import type { WeeklyCoachingRecord } from '../coaching/types';
import type { DailyReadinessInputs, DailyReadinessRecord } from '../readiness/types';
import type { ExerciseProgressionDecision } from '../progression/types';
import { buildDailyPlan } from '../nutrition/mealBuilder';
import type { NutritionProfile } from '../nutrition/types';
import type { DetailedNutritionAdherence } from '../nutrition/adherence';
import type { PerformanceSummary, ExercisePerformanceMetrics, TrendResult } from '../performance/types';

const ALL_INTENTS: AiCoachIntent[] = [
  'feeling_tired',
  'adjust_todays_workout',
  'have_pain',
  'traveling',
  'replace_exercise',
  'missed_workout',
  'ask_about_nutrition',
  'why_consistency_dropped',
  'whats_next_week_change',
  'why_workout_reduced',
  'how_ready_am_i',
  'should_i_train_today',
  'why_weight_increased',
  'why_no_progression',
  'whats_changed_from_last_week',
  'what_should_i_aim_for',
  'why_this_exercise',
  'what_muscles_does_this_train',
  'easier_version',
  'harder_version',
  'why_limited_alternatives',
  'what_should_i_eat_today',
  'what_are_my_calories',
  'why_these_foods',
  'replace_food',
  'how_is_my_nutrition_this_week',
  'im_traveling',
  'how_train_while_traveling',
  'whats_changed_traveling',
  'i_have_competition',
  'why_workout_adjusted_for_context',
  'after_competition',
  'when_normal_plan_returns',
  'am_i_improving',
  'whats_improved_this_week',
  'whats_declined',
  'strongest_exercise',
  'did_i_set_a_pr',
  'how_is_my_recovery_trend',
  'how_is_my_goal_progress',
];

function progressionDecision(overrides: Partial<ExerciseProgressionDecision> = {}): ExerciseProgressionDecision {
  return {
    exerciseName: 'Back Squat',
    decision: 'PROGRESS',
    model: 'load',
    nextTarget: { sets: 3, reps: 6, loadKg: 72.5 },
    previousTarget: { sets: 3, reps: 8, loadKg: 70 },
    reason: 'Progressed because you completed the target with 3 reps in reserve.',
    exposureCount: 1,
    confidence: 'medium',
    ...overrides,
  };
}

function readinessRecord(overrides: Partial<DailyReadinessInputs> = {}): DailyReadinessRecord {
  const inputs: DailyReadinessInputs = {
    sleepQuality: 3, sleepDurationBucket: 3, energy: 3, stress: 3, soreness: 3, motivation: 3, painFlag: false,
    ...overrides,
  };
  const result = computeReadiness(inputs);
  return {
    date: '2026-02-01',
    inputs: result.factors,
    score: result.score,
    status: result.status,
    recommendation: result.recommendation,
    recommendationApplied: result.recommendation.adjustmentApplied,
    submittedAt: '2026-02-01T08:00:00.000Z',
  };
}

function record(overrides: Partial<WeeklyCoachingRecord> = {}): WeeklyCoachingRecord {
  return {
    reviewedPlanWeek: 2,
    appliesFromPlanWeek: 3,
    weekStartDateKey: '2026-01-12',
    checkIn: { barrierIds: ['time'], submittedAt: '2026-01-18' },
    decision: {
      barrier: 'time',
      severity: 'high',
      evidence: '3 of 5 planned sessions missed',
      confidence: 'high',
      recommendedAction: 'REDUCE_SESSION_DURATION',
      affectedPlanArea: 'training',
      proposedChanges: { trainingAdjustment: { volumeMultiplier: 0.65, note: 'test' }, summary: '~50 min -> ~33 min' },
      reason: 'Session length was inconsistent with reported time availability.',
      requiresApproval: true,
      isRecurring: false,
      recurringWeeks: 0,
    },
    approvalStatus: 'pending',
    decidedAt: null,
    ...overrides,
  };
}

describe('getAiCoachReply — deterministic coaching actions', () => {
  it('returns a reply for every closed intent, never throwing or falling through', () => {
    for (const intent of ALL_INTENTS) {
      expect(() => getAiCoachReply(intent)).not.toThrow();
      const reply = getAiCoachReply(intent);
      expect(typeof reply.message).toBe('string');
      expect(reply.message.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic — the same intent always returns the same reply', () => {
    const a = getAiCoachReply('feeling_tired');
    const b = getAiCoachReply('feeling_tired');
    expect(a).toEqual(b);
  });

  it('"have_pain" always produces a pain-safe adjustment (skip high-impact + bodyweight)', () => {
    const reply = getAiCoachReply('have_pain');
    expect(reply.adjustment?.skipHighImpact).toBe(true);
    expect(reply.adjustment?.swapToBodyweight).toBe(true);
  });

  it('"feeling_tired" and "adjust_todays_workout" reduce volume rather than skip the session entirely', () => {
    expect(getAiCoachReply('feeling_tired').adjustment?.volumeMultiplier).toBeLessThan(1);
    expect(getAiCoachReply('adjust_todays_workout').adjustment?.volumeMultiplier).toBeLessThan(1);
  });

  it('"missed_workout" and "ask_about_nutrition" carry no plan adjustment (informational only)', () => {
    expect(getAiCoachReply('missed_workout').adjustment).toBeUndefined();
    expect(getAiCoachReply('ask_about_nutrition').adjustment).toBeUndefined();
  });
});

describe('getAiCoachReply — weekly coaching intents, deterministic over structured context', () => {
  it('why_consistency_dropped explains the stored barrier and evidence when a record exists', () => {
    const reply = getAiCoachReply('why_consistency_dropped', { latestRecord: record() });
    expect(reply.message).toContain('time');
    expect(reply.message).toContain('3 of 5 planned sessions missed');
    expect(reply.ctaLabel).toBe('VIEW WEEKLY REPORT');
  });

  it('why_consistency_dropped gives an honest "not enough data" reply with no record', () => {
    const reply = getAiCoachReply('why_consistency_dropped', { latestRecord: null });
    expect(reply.message.toLowerCase()).toContain("don't have");
  });

  it('whats_next_week_change surfaces the exact stored proposedChanges summary', () => {
    const reply = getAiCoachReply('whats_next_week_change', { latestRecord: record() });
    expect(reply.message).toContain('~50 min -> ~33 min');
  });

  it('whats_next_week_change says nothing is planned when there is no proposed change', () => {
    const clean = record({
      decision: {
        barrier: null, severity: 'low', evidence: 'clean week', confidence: 'high',
        recommendedAction: 'NO_ACTION_NEEDED', affectedPlanArea: 'none', proposedChanges: null,
        reason: 'This week met the plan.', requiresApproval: false, isRecurring: false, recurringWeeks: 0,
      },
    });
    const reply = getAiCoachReply('whats_next_week_change', { latestRecord: clean });
    expect(reply.message.toLowerCase()).toContain('no changes');
  });

  it('why_workout_reduced explains the applied change only when the record was actually approved', () => {
    const approved = record({ approvalStatus: 'approved' });
    const reply = getAiCoachReply('why_workout_reduced', { latestRecord: approved });
    expect(reply.message).toContain('time');
    expect(reply.message).toContain('Session length was inconsistent with reported time availability.');
  });

  it('why_workout_reduced does not claim a reduction happened when the recommendation is only pending', () => {
    const pending = record({ approvalStatus: 'pending' });
    const reply = getAiCoachReply('why_workout_reduced', { latestRecord: pending });
    expect(reply.message.toLowerCase()).toContain("hasn't reduced");
  });

  it('all three weekly-coaching intents never throw and never invoke an external API (pure string templating)', () => {
    for (const intent of ['why_consistency_dropped', 'whats_next_week_change', 'why_workout_reduced'] as AiCoachIntent[]) {
      expect(() => getAiCoachReply(intent)).not.toThrow();
      expect(() => getAiCoachReply(intent, { latestRecord: record() })).not.toThrow();
    }
  });
});

describe('getAiCoachReply — Daily Readiness intents (W)', () => {
  it('how_ready_am_i asks the athlete to check in first when no readiness record exists', () => {
    const reply = getAiCoachReply('how_ready_am_i', { latestRecord: null, todayReadiness: null });
    expect(reply.message.toLowerCase()).toContain("haven't checked in");
    expect(reply.ctaLabel).toBe('CHECK IN');
  });

  it('how_ready_am_i reports the real score/status/factors when a record exists', () => {
    const readiness = readinessRecord({ energy: 5, sleepQuality: 5, stress: 1, soreness: 1 });
    const reply = getAiCoachReply('how_ready_am_i', { latestRecord: null, todayReadiness: readiness });
    expect(reply.message).toContain(`${readiness.score}%`);
    expect(reply.message).toContain('energy 5/5');
  });

  it('should_i_train_today tells the athlete to check in first when no record exists', () => {
    const reply = getAiCoachReply('should_i_train_today', { latestRecord: null, todayReadiness: null });
    expect(reply.ctaLabel).toBe('CHECK IN');
  });

  it('should_i_train_today gives a conservative recovery answer on a recovery-status day', () => {
    const readiness = readinessRecord({ energy: 1, sleepQuality: 1, sleepDurationBucket: 1, stress: 5, soreness: 5 });
    expect(readiness.status).toBe('recovery');
    const reply = getAiCoachReply('should_i_train_today', { latestRecord: null, todayReadiness: readiness });
    expect(reply.message.toLowerCase()).toContain('light');
  });

  it('should_i_train_today prioritizes pain safety over the numeric status', () => {
    const readiness = readinessRecord({ energy: 5, sleepQuality: 5, stress: 1, soreness: 1, painFlag: true });
    const reply = getAiCoachReply('should_i_train_today', { latestRecord: null, todayReadiness: readiness });
    expect(reply.message.toLowerCase()).toContain('pain');
    expect(reply.message).not.toMatch(/diagnos/i);
  });

  it('should_i_train_today says yes on a high-readiness day', () => {
    const readiness = readinessRecord({ energy: 5, sleepQuality: 5, stress: 1, soreness: 1 });
    const reply = getAiCoachReply('should_i_train_today', { latestRecord: null, todayReadiness: readiness });
    expect(reply.message.toLowerCase()).toContain('yes');
  });

  it('why_workout_reduced explains a readiness-driven reduction when one was applied today', () => {
    const readiness = readinessRecord({ energy: 1, sleepQuality: 1, sleepDurationBucket: 1, stress: 5, soreness: 5 });
    expect(readiness.recommendationApplied).toBe(true);
    const reply = getAiCoachReply('why_workout_reduced', { latestRecord: null, todayReadiness: readiness });
    expect(reply.message).toContain(readiness.recommendation.message);
  });

  it("why_workout_reduced prefers today's readiness explanation over an approved weekly-coaching record", () => {
    const readiness = readinessRecord({ energy: 1, sleepQuality: 1, sleepDurationBucket: 1, stress: 5, soreness: 5 });
    const approvedWeekly = record({ approvalStatus: 'approved' });
    const reply = getAiCoachReply('why_workout_reduced', { latestRecord: approvedWeekly, todayReadiness: readiness });
    expect(reply.message).toContain(readiness.recommendation.message);
    expect(reply.message).not.toContain('Session length was inconsistent');
  });

  it('both readiness intents never throw and are deterministic', () => {
    const readiness = readinessRecord();
    for (const intent of ['how_ready_am_i', 'should_i_train_today'] as AiCoachIntent[]) {
      expect(() => getAiCoachReply(intent, { latestRecord: null, todayReadiness: readiness })).not.toThrow();
      const a = getAiCoachReply(intent, { latestRecord: null, todayReadiness: readiness });
      const b = getAiCoachReply(intent, { latestRecord: null, todayReadiness: readiness });
      expect(a).toEqual(b);
    }
  });
});

describe('getAiCoachReply — Progression Engine intents (X)', () => {
  it('why_weight_increased explains the real load bump when one exists', () => {
    const reply = getAiCoachReply('why_weight_increased', {
      latestRecord: null,
      todaysProgressionDecisions: [progressionDecision()],
    });
    expect(reply.message).toContain('reserve');
    expect(reply.message).toContain('72.5kg');
  });

  it('why_weight_increased gives an honest answer when no load actually increased', () => {
    const reply = getAiCoachReply('why_weight_increased', {
      latestRecord: null,
      todaysProgressionDecisions: [progressionDecision({ decision: 'MAINTAIN', nextTarget: { sets: 3, reps: 8, loadKg: 70 } })],
    });
    expect(reply.message.toLowerCase()).toContain("hasn't increased");
  });

  it("why_no_progression explains a HOLD/MAINTAIN/REGRESS reason when one exists", () => {
    const held = progressionDecision({ decision: 'HOLD', reason: 'Held because your last session for this exercise was missed.' });
    const reply = getAiCoachReply('why_no_progression', { latestRecord: null, todaysProgressionDecisions: [held] });
    expect(reply.message).toBe(held.reason);
  });

  it('why_no_progression is honest when everything actually progressed', () => {
    const reply = getAiCoachReply('why_no_progression', { latestRecord: null, todaysProgressionDecisions: [progressionDecision()] });
    expect(reply.message.toLowerCase()).toContain('progressing well');
  });

  it('why_no_progression is honest when there is no history at all', () => {
    const reply = getAiCoachReply('why_no_progression', { latestRecord: null, todaysProgressionDecisions: [] });
    expect(reply.message.toLowerCase()).toContain("don't have enough");
  });

  it('whats_changed_from_last_week describes the previous -> next target transition', () => {
    const reply = getAiCoachReply('whats_changed_from_last_week', {
      latestRecord: null,
      todaysProgressionDecisions: [progressionDecision()],
    });
    expect(reply.message).toContain('70kg');
    expect(reply.message).toContain('72.5kg');
    expect(reply.message).toContain('->');
  });

  it('what_should_i_aim_for states the next target', () => {
    const reply = getAiCoachReply('what_should_i_aim_for', {
      latestRecord: null,
      todaysProgressionDecisions: [progressionDecision()],
    });
    expect(reply.message).toContain('Back Squat');
    expect(reply.message).toContain('72.5kg');
  });

  it('all four progression intents never throw with no context or empty decisions', () => {
    for (const intent of ['why_weight_increased', 'why_no_progression', 'whats_changed_from_last_week', 'what_should_i_aim_for'] as AiCoachIntent[]) {
      expect(() => getAiCoachReply(intent)).not.toThrow();
      expect(() => getAiCoachReply(intent, { latestRecord: null, todaysProgressionDecisions: [] })).not.toThrow();
    }
  });

  it('are deterministic — identical decisions always produce identical replies', () => {
    const decisions = [progressionDecision()];
    const a = getAiCoachReply('whats_changed_from_last_week', { latestRecord: null, todaysProgressionDecisions: decisions });
    const b = getAiCoachReply('whats_changed_from_last_week', { latestRecord: null, todaysProgressionDecisions: decisions });
    expect(a).toEqual(b);
  });
});

describe('getAiCoachReply — Exercise Intelligence intents (Y)', () => {
  const constraints = { availableEquipment: ['barbell', 'squat_rack', 'bench'], injuryIds: ['none'] };

  it('why_this_exercise explains the focused exercise from real ExerciseDefinition data', () => {
    const reply = getAiCoachReply('why_this_exercise', { latestRecord: null, focusedExerciseName: 'Back Squat' });
    expect(reply.message).toContain('Back Squat');
    expect(reply.message).toContain('Squat');
  });

  it('why_this_exercise is honest when no exercise is in focus and no fallback exists', () => {
    const reply = getAiCoachReply('why_this_exercise', { latestRecord: null });
    expect(reply.message).toMatch(/don't have a specific exercise/i);
  });

  it('what_muscles_does_this_train lists real primary/secondary muscles', () => {
    const reply = getAiCoachReply('what_muscles_does_this_train', { latestRecord: null, focusedExerciseName: 'Back Squat' });
    expect(reply.message).toContain('Quads');
    expect(reply.message).toContain('Glutes');
  });

  it('easier_version names the curated regression when one exists', () => {
    const reply = getAiCoachReply('easier_version', { latestRecord: null, focusedExerciseName: 'Back Squat' });
    expect(reply.message).toContain('Goblet Squat');
  });

  it('easier_version is honest when no regression is authored', () => {
    const reply = getAiCoachReply('easier_version', { latestRecord: null, focusedExerciseName: 'Goblet Squat' });
    expect(reply.message).toMatch(/no simpler pre-defined version/i);
  });

  it('harder_version names the curated progression when one exists', () => {
    const reply = getAiCoachReply('harder_version', { latestRecord: null, focusedExerciseName: 'Push-Ups' });
    expect(reply.message).toContain('Feet-Elevated Push-Up');
  });

  it('harder_version is honest when no progression is authored', () => {
    const reply = getAiCoachReply('harder_version', { latestRecord: null, focusedExerciseName: 'Back Squat' });
    expect(reply.message).toMatch(/no harder pre-defined progression/i);
  });

  it('why_limited_alternatives explains real equipment/injury constraints when they apply', () => {
    const reply = getAiCoachReply('why_limited_alternatives', {
      latestRecord: null,
      focusedExerciseName: 'Back Squat',
      athleteConstraints: { availableEquipment: [], injuryIds: ['knee'] },
    });
    expect(reply.message).toContain('equipment');
    expect(reply.message).toMatch(/knee/i);
  });

  it('why_limited_alternatives is honest when nothing is actually restricted', () => {
    const reply = getAiCoachReply('why_limited_alternatives', {
      latestRecord: null,
      focusedExerciseName: 'Back Squat',
      athleteConstraints: constraints,
    });
    expect(reply.message).toMatch(/nothing is being held back/i);
  });

  it('replace_exercise recommends a real, ranked alternative when a focused exercise + constraints are given', () => {
    const reply = getAiCoachReply('replace_exercise', {
      latestRecord: null,
      focusedExerciseName: 'Back Squat',
      athleteConstraints: constraints,
    });
    expect(reply.message).toContain('Back Squat');
    expect(reply.ctaLabel).toBe('CHOOSE EXERCISE');
  });

  it('replace_exercise falls back to the generic dead-end message with no focus/constraints', () => {
    const reply = getAiCoachReply('replace_exercise', { latestRecord: null });
    expect(reply.message).toMatch(/tell me which exercise/i);
  });

  it('replace_exercise never recommends an unsafe exercise even when constraints report an injury', () => {
    const reply = getAiCoachReply('replace_exercise', {
      latestRecord: null,
      focusedExerciseName: 'Back Squat',
      athleteConstraints: { availableEquipment: ['barbell', 'squat_rack'], injuryIds: ['knee'] },
    });
    expect(reply.message).not.toContain('undefined');
  });

  it('all five exercise-intelligence intents never throw and are deterministic', () => {
    const context = { latestRecord: null, focusedExerciseName: 'Back Squat', athleteConstraints: constraints };
    const intents: AiCoachIntent[] = [
      'why_this_exercise',
      'what_muscles_does_this_train',
      'easier_version',
      'harder_version',
      'why_limited_alternatives',
      'replace_exercise',
    ];
    for (const intent of intents) {
      expect(() => getAiCoachReply(intent, context)).not.toThrow();
      expect(getAiCoachReply(intent, context)).toEqual(getAiCoachReply(intent, context));
    }
  });
});

// AD: AI Coach nutrition intents (spec §33)
describe('getAiCoachReply — Nutrition Engine intents (AD)', () => {
  function nutritionProfile(overrides: Partial<NutritionProfile> = {}): NutritionProfile {
    return {
      goal: 'general_fitness',
      sex: 'male',
      weightKg: 80,
      heightCm: 180,
      age: 28,
      daysAvailablePerWeek: 4,
      sport: 'football',
      dietaryPreference: 'no_restriction',
      allergyIds: ['none'],
      budgetTier: 'medium',
      mealsPerDay: 4,
      dislikedFoodIds: [],
      likedFoodIds: [],
      isTrainingDay: true,
      ...overrides,
    };
  }
  const TARGETS = { calories: 2800, proteinG: 160, carbsG: 350, fatG: 80 };
  const plan = buildDailyPlan(nutritionProfile(), TARGETS);
  const foodConstraints = { dietaryPreference: 'no_restriction' as const, allergyIds: ['none'], budgetTier: 'medium' as const };
  const focusedFoodId = plan.meals.find((m) => m.items.length > 0)!.items[0].foodId;

  it('what_should_i_eat_today summarizes the real generated plan', () => {
    const reply = getAiCoachReply('what_should_i_eat_today', { latestRecord: null, dailyPlan: plan });
    expect(reply.message).toContain(String(plan.totals.calories));
    expect(reply.ctaLabel).toBe('OPEN NUTRITION');
  });

  it('what_should_i_eat_today is honest when no plan has been generated yet', () => {
    const reply = getAiCoachReply('what_should_i_eat_today', { latestRecord: null });
    expect(reply.message).toMatch(/don't have today's plan/i);
  });

  it('what_are_my_calories reports the real nutrition targets', () => {
    const reply = getAiCoachReply('what_are_my_calories', { latestRecord: null, nutritionTargets: TARGETS });
    expect(reply.message).toContain('2800');
    expect(reply.message).toContain('160');
  });

  it('what_are_my_calories is honest when targets are not yet calculated', () => {
    const reply = getAiCoachReply('what_are_my_calories', { latestRecord: null });
    expect(reply.message).toMatch(/don't have your nutrition targets/i);
  });

  it('why_these_foods explains the focused food from real FoodDefinition data', () => {
    const reply = getAiCoachReply('why_these_foods', { latestRecord: null, focusedFoodId });
    expect(reply.message).not.toContain('undefined');
  });

  it('why_these_foods is honest when no food is in focus and no plan fallback exists', () => {
    const reply = getAiCoachReply('why_these_foods', { latestRecord: null });
    expect(reply.message).toMatch(/don't have a specific food/i);
  });

  it('replace_food recommends a real, safe alternative when a focused food + constraints are given', () => {
    const reply = getAiCoachReply('replace_food', {
      latestRecord: null,
      focusedFoodId,
      foodAthleteConstraints: foodConstraints,
    });
    expect(reply.ctaLabel).toBe('OPEN NUTRITION');
    expect(reply.message).not.toContain('undefined');
  });

  it('replace_food falls back to the generic dead-end message with no focus/constraints', () => {
    const reply = getAiCoachReply('replace_food', { latestRecord: null });
    expect(reply.message).toMatch(/tell me which food/i);
  });

  it('replace_food never recommends an unsafe food even under an allergy constraint', () => {
    const reply = getAiCoachReply('replace_food', {
      latestRecord: null,
      focusedFoodId,
      foodAthleteConstraints: { dietaryPreference: 'no_restriction', allergyIds: ['gluten'], budgetTier: 'medium' },
    });
    expect(reply.message).not.toContain('undefined');
  });

  it('how_is_my_nutrition_this_week reports real adherence data when available', () => {
    const adherence: DetailedNutritionAdherence = {
      caloriesAdherencePct: 85,
      proteinAdherencePct: 92,
      mealCompletionPct: 70,
      daysWithDetailedLogs: 4,
      isIncomplete: false,
    };
    const reply = getAiCoachReply('how_is_my_nutrition_this_week', { latestRecord: null, nutritionAdherence: adherence });
    expect(reply.message).toContain('85');
    expect(reply.message).toContain('92');
    expect(reply.ctaLabel).toBe('VIEW WEEKLY REPORT');
  });

  it('how_is_my_nutrition_this_week is honest when logging is incomplete rather than presenting 0% adherence', () => {
    const reply = getAiCoachReply('how_is_my_nutrition_this_week', {
      latestRecord: null,
      nutritionAdherence: { caloriesAdherencePct: null, proteinAdherencePct: null, mealCompletionPct: 10, daysWithDetailedLogs: 0, isIncomplete: true },
    });
    expect(reply.message).toMatch(/don't have enough detailed food logging/i);
    expect(reply.message).not.toContain('0%');
  });

  it('all five nutrition intents never throw and are deterministic', () => {
    const context = { latestRecord: null, dailyPlan: plan, nutritionTargets: TARGETS, focusedFoodId, foodAthleteConstraints: foodConstraints };
    const intents: AiCoachIntent[] = ['what_should_i_eat_today', 'what_are_my_calories', 'why_these_foods', 'replace_food', 'how_is_my_nutrition_this_week'];
    for (const intent of intents) {
      expect(() => getAiCoachReply(intent, context)).not.toThrow();
      expect(getAiCoachReply(intent, context)).toEqual(getAiCoachReply(intent, context));
    }
  });
});

// AB: AI Coach travel/competition intents (spec §33/§23)
describe('getAiCoachReply — Travel/Competition intents (AB)', () => {
  const travel = {
    id: 't1',
    mode: 'travel' as const,
    startDate: '2026-03-01',
    endDate: '2026-03-10',
    constraints: { equipmentIds: ['dumbbells'], locationIds: ['home'], time: { minutesAvailable: 30 }, affectsNutrition: false },
    createdAt: '2026-02-25T00:00:00.000Z',
    source: 'athlete' as const,
  };
  const competition = {
    id: 'e1',
    mode: 'competition' as const,
    eventDate: '2026-03-20',
    eventType: 'match' as const,
    createdAt: '2026-02-25T00:00:00.000Z',
    source: 'athlete' as const,
  };

  it('im_traveling reports real active-travel status', () => {
    const reply = getAiCoachReply('im_traveling', {
      latestRecord: null,
      resolvedContext: { mode: 'travel', travel, competition: null, competitionPhase: 'none' },
    });
    expect(reply.message).toContain('2026-03-10');
  });

  it('im_traveling is honest when travel mode is not active', () => {
    const reply = getAiCoachReply('im_traveling', { latestRecord: null, resolvedContext: { mode: 'normal', travel: null, competition: null, competitionPhase: 'none' } });
    expect(reply.message).toMatch(/start travel mode/i);
  });

  it('how_train_while_traveling describes the real active equipment/time constraints', () => {
    const reply = getAiCoachReply('how_train_while_traveling', {
      latestRecord: null,
      resolvedContext: { mode: 'travel', travel, competition: null, competitionPhase: 'none' },
    });
    expect(reply.message).toContain('30');
  });

  it('how_train_while_traveling is honest when travel is not active', () => {
    const reply = getAiCoachReply('how_train_while_traveling', { latestRecord: null, resolvedContext: { mode: 'normal', travel: null, competition: null, competitionPhase: 'none' } });
    expect(reply.message).toMatch(/not in travel mode/i);
  });

  it('whats_changed_traveling reuses the real contextMessage when supplied', () => {
    const reply = getAiCoachReply('whats_changed_traveling', {
      latestRecord: null,
      resolvedContext: { mode: 'travel', travel, competition: null, competitionPhase: 'none' },
      contextMessage: "Today's session uses your travel equipment.",
    });
    expect(reply.message).toBe("Today's session uses your travel equipment.");
  });

  it('i_have_competition reports real days-until-event from structured data', () => {
    const reply = getAiCoachReply('i_have_competition', {
      latestRecord: null,
      resolvedContext: { mode: 'competition', travel: null, competition, competitionPhase: 'near' },
      today: '2026-03-15',
    });
    expect(reply.message).toContain('5 day');
  });

  it('i_have_competition is honest when no competition is on file', () => {
    const reply = getAiCoachReply('i_have_competition', { latestRecord: null, resolvedContext: { mode: 'normal', travel: null, competition: null, competitionPhase: 'none' } });
    expect(reply.message).toMatch(/add a competition/i);
  });

  it('why_workout_adjusted_for_context explains today\'s real change when one occurred', () => {
    const reply = getAiCoachReply('why_workout_adjusted_for_context', {
      latestRecord: null,
      contextMessage: 'Training adjusted around your upcoming competition.',
    });
    expect(reply.message).toBe('Training adjusted around your upcoming competition.');
  });

  it('why_workout_adjusted_for_context is honest when nothing changed today', () => {
    const reply = getAiCoachReply('why_workout_adjusted_for_context', { latestRecord: null });
    expect(reply.message).toMatch(/wasn't changed/i);
  });

  it('after_competition describes the real post-event recovery window', () => {
    const reply = getAiCoachReply('after_competition', {
      latestRecord: null,
      resolvedContext: { mode: 'competition', travel: null, competition, competitionPhase: 'post_event' },
    });
    expect(reply.message).toMatch(/recovery/i);
  });

  it('after_competition is honest when there is no competition on file', () => {
    const reply = getAiCoachReply('after_competition', { latestRecord: null, resolvedContext: { mode: 'normal', travel: null, competition: null, competitionPhase: 'none' } });
    expect(reply.message).toMatch(/don't have a competition/i);
  });

  it('when_normal_plan_returns reports the real travel end date', () => {
    const reply = getAiCoachReply('when_normal_plan_returns', {
      latestRecord: null,
      resolvedContext: { mode: 'travel', travel, competition: null, competitionPhase: 'none' },
    });
    expect(reply.message).toContain('2026-03-10');
  });

  it('when_normal_plan_returns is honest when already on the normal plan', () => {
    const reply = getAiCoachReply('when_normal_plan_returns', { latestRecord: null, resolvedContext: { mode: 'normal', travel: null, competition: null, competitionPhase: 'none' } });
    expect(reply.message).toMatch(/already on your normal plan/i);
  });

  it('all seven travel/competition intents never throw and are deterministic', () => {
    const context = {
      latestRecord: null,
      resolvedContext: { mode: 'travel' as const, travel, competition: null, competitionPhase: 'none' as const },
      today: '2026-03-05',
      contextMessage: "Today's session uses your travel equipment.",
    };
    const intents: AiCoachIntent[] = [
      'im_traveling',
      'how_train_while_traveling',
      'whats_changed_traveling',
      'i_have_competition',
      'why_workout_adjusted_for_context',
      'after_competition',
      'when_normal_plan_returns',
    ];
    for (const intent of intents) {
      expect(() => getAiCoachReply(intent, context)).not.toThrow();
      expect(getAiCoachReply(intent, context)).toEqual(getAiCoachReply(intent, context));
    }
  });
});

describe('getFallbackReply', () => {
  it('never throws and returns a stable, adjustment-free message for unrecognized free text', () => {
    expect(() => getFallbackReply()).not.toThrow();
    const reply = getFallbackReply();
    expect(reply.adjustment).toBeUndefined();
    expect(reply.message.length).toBeGreaterThan(0);
  });
});

const INSUFFICIENT: TrendResult = { state: 'insufficient_data', confidence: 'insufficient', sampleSize: 0 };

function exerciseMetrics(overrides: Partial<ExercisePerformanceMetrics> = {}): ExercisePerformanceMetrics {
  return {
    exerciseName: 'Back Squat',
    model: 'load',
    totalExposures: 4,
    successfulExposures: 4,
    failedOrPartialExposures: 0,
    contextualExposureCount: 0,
    previous: { date: '2026-01-01', value: 60, label: '60kg' },
    current: { date: '2026-01-08', value: 65, label: '65kg' },
    best: { date: '2026-01-08', value: 65, label: '65kg' },
    trend: INSUFFICIENT,
    personalRecords: [],
    latestProgressionDecision: null,
    ...overrides,
  };
}

function performanceSummary(overrides: Partial<PerformanceSummary> = {}): PerformanceSummary {
  return {
    exercises: [],
    trainingConsistency: { hasData: false, plannedSessions: 0, completedSessions: 0, adjustedSessions: 0, travelAdjustedSessions: 0, intentionallySkippedCompetitionSessions: 0, completionPct: 0 },
    nutrition: { hasDetailedData: false, caloriesAdherencePct: null, proteinAdherencePct: null, mealCompletionPct: 0, daysWithDetailedLogs: 0, trend: INSUFFICIENT },
    readiness: { hasData: false, checkInsCount: 0, averageScore: null, lowReadinessDaysCount: 0, scoreTrend: INSUFFICIENT, sleepTrend: INSUFFICIENT, energyTrend: INSUFFICIENT, sorenessTrend: INSUFFICIENT, stressTrend: INSUFFICIENT },
    weight: { hasData: false, points: [], deltaKg: 0, trend: INSUFFICIENT, goalAlignment: 'insufficient_data' },
    goalProgress: { goal: 'general_fitness', overallScore: null, components: [] },
    weekComparison: { metrics: [] },
    milestones: [],
    ...overrides,
  };
}

describe('getAiCoachReply — progress/performance intents (spec §23)', () => {
  it('am_i_improving is honest when there is no comparable exercise history yet', () => {
    const reply = getAiCoachReply('am_i_improving', { latestRecord: null, performanceSummary: performanceSummary() });
    expect(reply.message).toMatch(/don't have enough comparable/i);
  });

  it('am_i_improving reports real improving-vs-declining counts', () => {
    const summary = performanceSummary({
      exercises: [
        exerciseMetrics({ exerciseName: 'Back Squat', trend: { state: 'improving', confidence: 'sufficient', sampleSize: 4 } }),
        exerciseMetrics({ exerciseName: 'Bench Press', trend: { state: 'declining', confidence: 'sufficient', sampleSize: 4 } }),
        exerciseMetrics({ exerciseName: 'Deadlift', trend: { state: 'improving', confidence: 'sufficient', sampleSize: 4 } }),
      ],
    });
    const reply = getAiCoachReply('am_i_improving', { latestRecord: null, performanceSummary: summary });
    expect(reply.message).toContain('2 of 3');
  });

  it('whats_improved_this_week lists real improving exercises and up metrics', () => {
    const summary = performanceSummary({
      exercises: [exerciseMetrics({ exerciseName: 'Back Squat', trend: { state: 'improving', confidence: 'sufficient', sampleSize: 4 } })],
      weekComparison: { metrics: [{ label: 'Nutrition adherence', thisWeek: 82, lastWeek: 74, direction: 'up' }] },
    });
    const reply = getAiCoachReply('whats_improved_this_week', { latestRecord: null, performanceSummary: summary });
    expect(reply.message).toContain('Back Squat');
    expect(reply.message).toContain('Nutrition adherence');
  });

  it('whats_improved_this_week is honest when nothing improved', () => {
    const reply = getAiCoachReply('whats_improved_this_week', { latestRecord: null, performanceSummary: performanceSummary() });
    expect(reply.message).toMatch(/nothing stands out/i);
  });

  it('whats_declined lists real declining exercises and down metrics', () => {
    const summary = performanceSummary({
      exercises: [exerciseMetrics({ exerciseName: 'Bench Press', trend: { state: 'declining', confidence: 'sufficient', sampleSize: 4 } })],
    });
    const reply = getAiCoachReply('whats_declined', { latestRecord: null, performanceSummary: summary });
    expect(reply.message).toContain('Bench Press');
  });

  it('whats_declined is honest when nothing is trending down', () => {
    const reply = getAiCoachReply('whats_declined', { latestRecord: null, performanceSummary: performanceSummary() });
    expect(reply.message).toMatch(/nothing is trending down/i);
  });

  it('strongest_exercise picks the improving exercise with the most evidence', () => {
    const summary = performanceSummary({
      exercises: [
        exerciseMetrics({ exerciseName: 'Back Squat', trend: { state: 'improving', confidence: 'sufficient', sampleSize: 3 } }),
        exerciseMetrics({ exerciseName: 'Deadlift', trend: { state: 'improving', confidence: 'sufficient', sampleSize: 6 } }),
      ],
    });
    const reply = getAiCoachReply('strongest_exercise', { latestRecord: null, performanceSummary: summary });
    expect(reply.message).toContain('Deadlift');
  });

  it('strongest_exercise is honest when nothing has enough history', () => {
    const reply = getAiCoachReply('strongest_exercise', { latestRecord: null, performanceSummary: performanceSummary() });
    expect(reply.message).toMatch(/don't have enough comparable/i);
  });

  it('did_i_set_a_pr reports a real recent PR when one exists', () => {
    const summary = performanceSummary({
      exercises: [
        exerciseMetrics({
          exerciseName: 'Back Squat',
          personalRecords: [{ exerciseName: 'Back Squat', model: 'load', bracketLabel: '8 reps', value: 65, label: '8 reps @ 65kg', achievedOn: '2026-01-08', isRecent: true }],
        }),
      ],
    });
    const reply = getAiCoachReply('did_i_set_a_pr', { latestRecord: null, performanceSummary: summary });
    expect(reply.message).toContain('Back Squat');
  });

  it('did_i_set_a_pr is honest when no recent PR exists', () => {
    const reply = getAiCoachReply('did_i_set_a_pr', { latestRecord: null, performanceSummary: performanceSummary() });
    expect(reply.message).toMatch(/not yet/i);
  });

  it('how_is_my_recovery_trend reports real average score, trend, and low-readiness days', () => {
    const summary = performanceSummary({
      readiness: {
        hasData: true,
        checkInsCount: 5,
        averageScore: 72,
        lowReadinessDaysCount: 1,
        scoreTrend: { state: 'improving', confidence: 'sufficient', sampleSize: 5 },
        sleepTrend: INSUFFICIENT,
        energyTrend: INSUFFICIENT,
        sorenessTrend: INSUFFICIENT,
        stressTrend: INSUFFICIENT,
      },
    });
    const reply = getAiCoachReply('how_is_my_recovery_trend', { latestRecord: null, performanceSummary: summary });
    expect(reply.message).toContain('72%');
    expect(reply.message).toMatch(/trending up/i);
  });

  it('how_is_my_recovery_trend is honest when there is no readiness history', () => {
    const reply = getAiCoachReply('how_is_my_recovery_trend', { latestRecord: null, performanceSummary: performanceSummary() });
    expect(reply.message).toMatch(/daily check-ins/i);
  });

  it('how_is_my_goal_progress reports the real weighted score', () => {
    const summary = performanceSummary({ goalProgress: { goal: 'fat_loss', overallScore: 68, components: [] } });
    const reply = getAiCoachReply('how_is_my_goal_progress', { latestRecord: null, performanceSummary: summary });
    expect(reply.message).toContain('68%');
    expect(reply.message).toMatch(/fat loss/i);
  });

  it('how_is_my_goal_progress is honest when there is not enough data yet', () => {
    const reply = getAiCoachReply('how_is_my_goal_progress', { latestRecord: null, performanceSummary: performanceSummary() });
    expect(reply.message).toMatch(/don't have enough logged data/i);
  });

  it('all seven progress/performance intents never throw and are deterministic even with no performanceSummary at all', () => {
    const intents: AiCoachIntent[] = [
      'am_i_improving',
      'whats_improved_this_week',
      'whats_declined',
      'strongest_exercise',
      'did_i_set_a_pr',
      'how_is_my_recovery_trend',
      'how_is_my_goal_progress',
    ];
    for (const intent of intents) {
      expect(() => getAiCoachReply(intent, { latestRecord: null })).not.toThrow();
      expect(getAiCoachReply(intent, { latestRecord: null })).toEqual(getAiCoachReply(intent, { latestRecord: null }));
    }
  });
});
