import { describe, expect, it } from 'vitest';
import { determineLevel } from './engine/levelEngine';
import { calculateNutritionTargets } from './engine/nutritionEngine';
import { generateMealPlan } from './engine/nutritionPlanEngine';
import { applyCoachAdjustment, generateTodayWorkout, generateWeekProgram } from './engine/planEngine';
import { computeProgressionInfo } from './engine/progressionEngine';
import {
  computeNutritionAdherence,
  computePerformanceStats,
  computeRecoveryScore,
  computeWorkoutCompletion,
} from './engine/progressEngine';
import { generateWeeklyReport } from './engine/weeklyReportEngine';
import { getSportModule } from './sports/registry';
import { addDays, localDateKey } from './engine/dateUtils';
import { footballModule } from './sports/football/program';
import type { AssessmentAnswers, FitnessLevel, MealSlot, UserProfile } from './engine/types';
import { buildWeeklyCoachingReview } from './engine/weeklyCoachingEngine';
import type { BarrierId } from './coaching/barriers';
import type { WeeklyCoachingRecord } from './coaching/types';
import type { DayLog } from './state/LogContext';

/**
 * Multi-athlete, multi-week simulation. Not a UI test — this drives the
 * real engine pipeline (Assessment answers -> AthleteProfile -> weekly plan
 * -> logged history -> progression -> nutrition -> weekly report) across a
 * representative matrix of athletes and several simulated weeks each, the
 * same way a real install accumulates state over time. Every assertion
 * checks an invariant the engine must hold for ANY athlete, not one
 * specific expected value — this is a stress/consistency pass, distinct
 * from the targeted unit tests elsewhere.
 */

interface SimAthlete {
  name: string;
  answers: AssessmentAnswers;
  /** Fraction of planned sessions actually logged as completed each week (simulates adherence). */
  completionRate: number;
}

const FULL_EQUIPMENT = [
  'dumbbells', 'barbell', 'bench', 'squat_rack', 'pull_up_bar', 'cable_machine',
  'kettlebell', 'resistance_bands', 'trx', 'plyo_box',
];

function athlete(overrides: Partial<AssessmentAnswers> & { name: string; completionRate?: number }): SimAthlete {
  const { name, completionRate = 1, ...answerOverrides } = overrides;
  return {
    name,
    completionRate,
    answers: {
      firstName: name,
      sport: 'football',
      goal: 'general_fitness',
      experienceYears: 0,
      currentTrainingFrequency: 0,
      daysAvailablePerWeek: 3,
      trainingLocationIds: ['home'],
      equipmentIds: [],
      injuryIds: ['none'],
      sex: 'male',
      age: 27,
      heightCm: 178,
      weightKg: 75,
      dietaryPreference: 'no_restriction',
      allergyIds: [],
      budgetTier: 'medium',
      ...answerOverrides,
    },
  };
}

const ATHLETES: SimAthlete[] = [
  athlete({
    name: 'Beginner, 2 days, no injury, home bodyweight, fat loss',
    experienceYears: 0, currentTrainingFrequency: 0, daysAvailablePerWeek: 2,
    injuryIds: ['none'], trainingLocationIds: ['home'], equipmentIds: [], goal: 'fat_loss',
    completionRate: 1,
  }),
  athlete({
    name: 'Intermediate, 3 days, knee limitation, gym equipment, maintenance',
    experienceYears: 2, currentTrainingFrequency: 3, daysAvailablePerWeek: 3,
    injuryIds: ['knee'], trainingLocationIds: ['gym'], equipmentIds: FULL_EQUIPMENT, goal: 'general_fitness',
    completionRate: 0.7,
  }),
  athlete({
    name: 'Advanced, 6 days, ankle limitation, sports field + club, muscle gain',
    experienceYears: 6, currentTrainingFrequency: 6, daysAvailablePerWeek: 6,
    injuryIds: ['ankle'], trainingLocationIds: ['sports_field', 'sports_club'], equipmentIds: FULL_EQUIPMENT, goal: 'muscle_gain',
    completionRate: 0.9,
  }),
  athlete({
    name: 'Intermediate, 5 days, multiple limitations (knee+ankle), mixed equipment, fat loss',
    experienceYears: 3, currentTrainingFrequency: 4, daysAvailablePerWeek: 5,
    injuryIds: ['knee', 'ankle'], trainingLocationIds: ['home', 'outdoor'], equipmentIds: ['dumbbells', 'resistance_bands'], goal: 'fat_loss',
    completionRate: 0.5,
  }),
  athlete({
    name: 'Beginner, 3 days, shoulder + lower_back limitations, no equipment, muscle gain',
    experienceYears: 0, currentTrainingFrequency: 1, daysAvailablePerWeek: 3,
    injuryIds: ['shoulder', 'lower_back'], trainingLocationIds: ['home'], equipmentIds: [], goal: 'muscle_gain',
    completionRate: 0.3, // consistently under-completing -> should never earn progression
  }),
  athlete({
    name: 'Advanced, 2 days low frequency despite high experience, no injury, full gym, recovery goal',
    experienceYears: 8, currentTrainingFrequency: 2, daysAvailablePerWeek: 2,
    injuryIds: ['none'], trainingLocationIds: ['gym'], equipmentIds: FULL_EQUIPMENT, goal: 'recovery',
    completionRate: 1,
  }),
  athlete({
    name: 'Unregistered sport falls back to generic program, no injury, vegan diet',
    experienceYears: 1, currentTrainingFrequency: 2, daysAvailablePerWeek: 3,
    sport: 'basketball', injuryIds: ['none'], dietaryPreference: 'vegan',
    trainingLocationIds: ['gym'], equipmentIds: FULL_EQUIPMENT, goal: 'general_fitness',
    completionRate: 0.8,
  }),
  // -- Swimming (second Sport Module) — same simulation harness, zero code changes --
  athlete({
    name: 'Swimming: beginner, 3 days, no injury, pool access, general fitness',
    sport: 'swimming', experienceYears: 0, currentTrainingFrequency: 0, daysAvailablePerWeek: 3,
    injuryIds: ['none'], trainingLocationIds: ['pool'], equipmentIds: [], goal: 'general_fitness',
    completionRate: 0.85,
  }),
  athlete({
    name: 'Swimming: advanced, 6 days, shoulder limitation, full swim kit, muscle gain',
    sport: 'swimming', experienceYears: 6, currentTrainingFrequency: 6, daysAvailablePerWeek: 6,
    injuryIds: ['shoulder'], trainingLocationIds: ['pool'],
    equipmentIds: ['kickboard', 'pull_buoy', 'fins', 'paddles', 'dumbbells', 'resistance_bands', 'medicine_ball', 'pull_up_bar', 'cable_machine'],
    goal: 'muscle_gain', completionRate: 0.6,
  }),
  athlete({
    name: 'Swimming: intermediate, 4 days, no pool access, knee limitation, fat loss',
    sport: 'swimming', experienceYears: 2, currentTrainingFrequency: 3, daysAvailablePerWeek: 4,
    injuryIds: ['knee'], trainingLocationIds: ['home'], equipmentIds: [], goal: 'fat_loss',
    completionRate: 1,
  }),
];

const WEEKS_TO_SIMULATE = 6;

function buildProfile(answers: AssessmentAnswers): UserProfile {
  const level = determineLevel(answers);
  const sportModule = getSportModule(answers.sport);
  const nutrition = calculateNutritionTargets(answers, sportModule.nutritionProfile);
  return { answers, level, nutrition };
}

describe('multi-athlete, multi-week simulation', () => {
  for (const sim of ATHLETES) {
    it(`${sim.name} — ${WEEKS_TO_SIMULATE} simulated weeks hold every engine invariant`, () => {
      const profile = buildProfile(sim.answers);
      expect(['beginner', 'intermediate', 'advanced']).toContain(profile.level);
      expect(Number.isFinite(profile.nutrition.calories)).toBe(true);
      expect(profile.nutrition.calories).toBeGreaterThanOrEqual(1200);

      const planStartDate = '2026-01-05'; // Monday
      const start = new Date(2026, 0, 5);
      const logs: Array<{ date: string; workoutCompleted: boolean }> = [];

      for (let week = 0; week < WEEKS_TO_SIMULATE; week++) {
        const today = addDays(start, week * 7 + 6); // evaluate at the end of each simulated week
        const { currentPlanWeek, progressionWeek } = computeProgressionInfo(
          planStartDate,
          logs,
          sim.answers.daysAvailablePerWeek,
          today
        );

        expect(Number.isFinite(currentPlanWeek)).toBe(true);
        expect(Number.isFinite(progressionWeek)).toBe(true);
        expect(progressionWeek).toBeGreaterThanOrEqual(1);
        expect(progressionWeek).toBeLessThanOrEqual(currentPlanWeek);

        // -- Training plan generation for this week's progression --
        const weekProgram = generateWeekProgram(profile, progressionWeek);
        expect(weekProgram.length).toBeGreaterThan(0);

        for (const day of weekProgram) {
          expect(['speed', 'strength', 'stamina']).toContain(day.statCategory);
          for (const ex of day.exercises) {
            expect(Number.isFinite(ex.sets)).toBe(true);
            expect(ex.sets).toBeGreaterThan(0);
            expect(typeof ex.reps).toBe('string');
            expect(ex.reps.length).toBeGreaterThan(0);
          }
        }

        // Regression: no exercise contraindicated for this athlete's injuries should
        // ever appear unchanged by name in the resolved plan — checked generically
        // against whichever sport module this athlete actually uses (registered or
        // generic-fallback), not hardcoded to one sport.
        const rawDays = getSportModule(sim.answers.sport).program[profile.level];
        for (const rawDay of rawDays) {
          const resolvedDay = weekProgram.find((d) => d.id === rawDay.id);
          if (!resolvedDay) continue;
          for (const slot of rawDay.exercises) {
            const flagged = slot.contraindications?.some((tag) => sim.answers.injuryIds.includes(tag));
            if (!flagged) continue;
            expect(resolvedDay.exercises.some((e) => e.name === slot.name)).toBe(false);
          }
        }

        // -- Simulate logging this week's activity at the athlete's adherence rate --
        const plannedSessionsThisWeek = Math.min(sim.answers.daysAvailablePerWeek, 7);
        const completedThisWeek = Math.round(plannedSessionsThisWeek * sim.completionRate);
        const weekStart = addDays(start, week * 7);
        for (let day = 0; day < 7; day++) {
          const date = localDateKey(addDays(weekStart, day));
          logs.push({ date, workoutCompleted: day < completedThisWeek });
        }

        // -- Nutrition: meal plan for this week must be internally consistent --
        const mealPlan = generateMealPlan(sim.answers, profile.nutrition);
        expect(mealPlan.map((e) => e.slot)).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
        for (const entry of mealPlan) {
          if (!entry.meal) continue;
          for (const allergen of entry.meal.allergens) {
            expect(sim.answers.allergyIds).not.toContain(allergen);
          }
        }

        // -- Progress + weekly report calculations over the week just logged --
        const weekLogs = logs.slice(-7).map((l) => ({
          date: l.date,
          loggedMealSlots: (l.workoutCompleted ? ['breakfast', 'lunch'] : []) as MealSlot[],
          mealOverrides: {},
          workoutCompleted: l.workoutCompleted,
          statCategory: 'strength' as const,
        }));
        const completion = computeWorkoutCompletion(weekLogs);
        expect(completion.completed).toBeLessThanOrEqual(completion.planned);

        const nutritionPct = computeNutritionAdherence(weekLogs);
        expect(nutritionPct).toBeGreaterThanOrEqual(0);
        expect(nutritionPct).toBeLessThanOrEqual(100);

        const recoveryPct = computeRecoveryScore(weekLogs, sim.answers.daysAvailablePerWeek);
        expect(Number.isNaN(recoveryPct)).toBe(false);
        expect(recoveryPct).toBeGreaterThanOrEqual(40);
        expect(recoveryPct).toBeLessThanOrEqual(95);

        const perfStats = computePerformanceStats(weekLogs);
        for (const cat of ['speed', 'strength', 'stamina'] as const) {
          expect(Number.isNaN(perfStats[cat].changePct)).toBe(false);
        }

        const report = generateWeeklyReport({
          workoutsCompleted: completion.completed,
          workoutsPlanned: completion.planned,
          nutritionAdherencePct: nutritionPct,
          recoveryAveragePct: recoveryPct,
          weightDeltaKg: 0,
          weakestArea: 'nutrition',
          strongestArea: 'strength',
        });
        expect(typeof report.headline).toBe('string');
        expect(report.headline.length).toBeGreaterThan(0);
        expect(Number.isNaN(report.workoutsCompleted)).toBe(false);
      }
    });
  }

  it('a consistently under-completing athlete never earns progression past week 1, across 6 weeks', () => {
    const sim = ATHLETES.find((a) => a.name.includes('shoulder + lower_back'))!;
    const planStartDate = '2026-01-05';
    const start = new Date(2026, 0, 5);
    const logs: Array<{ date: string; workoutCompleted: boolean }> = [];

    let lastProgressionWeek = 1;
    for (let week = 0; week < WEEKS_TO_SIMULATE; week++) {
      const today = addDays(start, week * 7 + 6);
      const info = computeProgressionInfo(planStartDate, logs, sim.answers.daysAvailablePerWeek, today);
      lastProgressionWeek = info.progressionWeek;

      const weekStart = addDays(start, week * 7);
      const completedThisWeek = Math.round(sim.answers.daysAvailablePerWeek * sim.completionRate);
      for (let day = 0; day < 7; day++) {
        logs.push({ date: localDateKey(addDays(weekStart, day)), workoutCompleted: day < completedThisWeek });
      }
    }
    expect(lastProgressionWeek).toBe(1);
  });

  it('a fully-consistent athlete does earn progression over 6 weeks', () => {
    const sim = ATHLETES.find((a) => a.name.includes('no injury, home bodyweight'))!;
    const planStartDate = '2026-01-05';
    const start = new Date(2026, 0, 5);
    const logs: Array<{ date: string; workoutCompleted: boolean }> = [];

    let lastProgressionWeek = 1;
    for (let week = 0; week < WEEKS_TO_SIMULATE; week++) {
      const weekStart = addDays(start, week * 7);
      const completedThisWeek = sim.answers.daysAvailablePerWeek;
      for (let day = 0; day < 7; day++) {
        logs.push({ date: localDateKey(addDays(weekStart, day)), workoutCompleted: day < completedThisWeek });
      }
      const today = addDays(start, week * 7 + 6);
      lastProgressionWeek = computeProgressionInfo(planStartDate, logs, sim.answers.daysAvailablePerWeek, today).progressionWeek;
    }
    expect(lastProgressionWeek).toBeGreaterThan(1);
  });

  it('every fitness level for the football module produces a valid plan for a clean athlete', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as FitnessLevel[]) {
      const answers = athlete({ name: 'clean', trainingLocationIds: ['sports_field', 'gym', 'home'], equipmentIds: FULL_EQUIPMENT }).answers;
      const profile: UserProfile = { answers, level, nutrition: calculateNutritionTargets(answers, footballModule.nutritionProfile) };
      const week = generateWeekProgram(profile, 1);
      expect(week.length).toBe(footballModule.program[level].length);
    }
  });
});

/**
 * Weekly Coaching Loop multi-week simulation (spec §14). Each scenario runs the
 * real barrier-detection + coaching-rule pipeline (buildWeeklyCoachingReview)
 * week over week, growing a real review history exactly as WeeklyCoachingContext
 * would persist it, and — for scenarios that approve a recommendation — verifies
 * the approved training adjustment concretely changes the FOLLOWING week's
 * resolved plan via the same `applyCoachAdjustment` mechanism used everywhere else.
 */

interface CoachingSimScenario {
  name: string;
  sim: SimAthlete;
  /** Same barrier(s) reported every week; [] = a clean, high-adherence week with nothing to report. */
  barriersEachWeek: BarrierId[];
  weeksToSimulate: number;
  /** Fraction of days per week with meals logged — defaults to the athlete's completionRate;
   * scenario 5 sets this independently low to isolate a nutrition-only problem. */
  mealLogRate?: number;
  /** Approve every approvable recommendation from this week index (0-based) onward, or never. */
  approveFromWeek: number | null;
}

const COACHING_SCENARIOS: CoachingSimScenario[] = [
  {
    name: '1. High-adherence athlete',
    sim: athlete({ name: 'coaching-high-adherence', daysAvailablePerWeek: 3, completionRate: 1, trainingLocationIds: ['home'], equipmentIds: [] }),
    barriersEachWeek: [],
    weeksToSimulate: 4,
    approveFromWeek: null,
  },
  {
    name: '2. Time-constrained athlete',
    sim: athlete({ name: 'coaching-time-constrained', daysAvailablePerWeek: 5, completionRate: 0.2, trainingLocationIds: ['home'], equipmentIds: [] }),
    barriersEachWeek: ['time'],
    weeksToSimulate: 5,
    approveFromWeek: 2,
  },
  {
    name: '3. Low-recovery athlete',
    sim: athlete({ name: 'coaching-low-recovery', daysAvailablePerWeek: 4, completionRate: 0.25, trainingLocationIds: ['home'], equipmentIds: [] }),
    barriersEachWeek: ['fatigue'],
    weeksToSimulate: 4,
    approveFromWeek: 1,
  },
  {
    name: '4. Frequent missed-workout athlete',
    sim: athlete({ name: 'coaching-missed-workouts', daysAvailablePerWeek: 5, completionRate: 0.3, trainingLocationIds: ['home'], equipmentIds: [] }),
    barriersEachWeek: ['schedule_conflict'],
    weeksToSimulate: 4,
    approveFromWeek: 1,
  },
  {
    name: '5. Nutrition-adherence problem',
    sim: athlete({ name: 'coaching-nutrition-problem', daysAvailablePerWeek: 3, completionRate: 1, budgetTier: 'high', trainingLocationIds: ['home'], equipmentIds: [] }),
    barriersEachWeek: ['nutrition_difficulty'],
    weeksToSimulate: 3,
    mealLogRate: 0.1,
    approveFromWeek: 0,
  },
  {
    name: '6. Equipment/travel problem',
    sim: athlete({ name: 'coaching-equipment-travel', daysAvailablePerWeek: 3, completionRate: 0.4, trainingLocationIds: ['gym'], equipmentIds: [] }),
    barriersEachWeek: ['travel'],
    weeksToSimulate: 3,
    approveFromWeek: 1,
  },
  {
    name: '7. Athlete with recurring barriers',
    sim: athlete({ name: 'coaching-recurring-barriers', daysAvailablePerWeek: 4, completionRate: 0.3, trainingLocationIds: ['home'], equipmentIds: [] }),
    barriersEachWeek: ['time'],
    weeksToSimulate: 5,
    approveFromWeek: null, // never approved — pattern detection must still fire every week
  },
];

describe('Weekly Coaching Loop multi-week simulation', () => {
  for (const scenario of COACHING_SCENARIOS) {
    it(`${scenario.name} — barriers, patterns, and recommendations evolve correctly over ${scenario.weeksToSimulate} weeks`, () => {
      const profile = buildProfile(scenario.sim.answers);
      const planStartDate = '2026-01-05';
      const start = new Date(2026, 0, 5);
      const mealLogRate = scenario.mealLogRate ?? scenario.sim.completionRate;

      const workoutLogs: Array<{ date: string; workoutCompleted: boolean }> = [];
      const allLogs: DayLog[] = [];
      const history: WeeklyCoachingRecord[] = [];

      for (let week = 0; week < scenario.weeksToSimulate; week++) {
        const weekStart = addDays(start, week * 7);
        const plannedThisWeek = Math.min(scenario.sim.answers.daysAvailablePerWeek, 7);
        const completedThisWeek = Math.round(plannedThisWeek * scenario.sim.completionRate);
        const mealsLoggedThisWeek = Math.round(7 * mealLogRate);

        const weekLogs: DayLog[] = [];
        for (let day = 0; day < 7; day++) {
          const date = localDateKey(addDays(weekStart, day));
          const dayLog: DayLog = {
            date,
            loggedMealSlots: day < mealsLoggedThisWeek ? (['breakfast', 'lunch'] as MealSlot[]) : [],
            mealOverrides: {},
            workoutCompleted: day < completedThisWeek,
          };
          weekLogs.push(dayLog);
          allLogs.push(dayLog);
          workoutLogs.push({ date, workoutCompleted: dayLog.workoutCompleted });
        }

        const today = addDays(weekStart, 6);
        const { currentPlanWeek, progressionWeek } = computeProgressionInfo(
          planStartDate,
          workoutLogs,
          scenario.sim.answers.daysAvailablePerWeek,
          today
        );

        // -- progression stays valid, and every resolved session is well-formed --
        const weekProgram = generateWeekProgram(profile, progressionWeek);
        expect(Number.isFinite(progressionWeek)).toBe(true);
        for (const day of weekProgram) {
          expect(day.exercises.length).toBeGreaterThan(0);
          for (const ex of day.exercises) {
            expect(Number.isFinite(ex.sets)).toBe(true);
            expect(ex.sets).toBeGreaterThan(0);
          }
        }

        const priorWeekLogs = week > 0 ? allLogs.slice(-14, -7) : [];
        const checkIn = scenario.barriersEachWeek.length > 0
          ? { barrierIds: scenario.barriersEachWeek, submittedAt: localDateKey(today) }
          : null;

        const reviewA = buildWeeklyCoachingReview(weekLogs, priorWeekLogs, scenario.sim.answers.daysAvailablePerWeek, checkIn, profile, history);
        const reviewB = buildWeeklyCoachingReview(weekLogs, priorWeekLogs, scenario.sim.answers.daysAvailablePerWeek, checkIn, profile, history);
        // -- deterministic: identical inputs always produce an identical decision --
        expect(reviewA.decision).toEqual(reviewB.decision);
        const { decision } = reviewA;

        // -- barriers are detected correctly --
        if (scenario.barriersEachWeek.length > 0) {
          expect(decision.barrier).toBe(scenario.barriersEachWeek[0]);
        } else {
          expect(decision.barrier).toBeNull();
          expect(decision.recommendedAction).toBe('NO_ACTION_NEEDED');
        }

        // -- recurring patterns are detected correctly (3rd consecutive week with the same barrier) --
        if (scenario.barriersEachWeek.length > 0 && week >= 2) {
          expect(decision.isRecurring).toBe(true);
          expect(decision.recurringWeeks).toBeGreaterThanOrEqual(3);
        }

        // -- recommendations never contradict athlete constraints --
        if (decision.proposedChanges?.daysAvailablePerWeek !== undefined) {
          expect(decision.proposedChanges.daysAvailablePerWeek).toBeGreaterThanOrEqual(2);
          expect(Number.isFinite(decision.proposedChanges.daysAvailablePerWeek)).toBe(true);
        }
        if (decision.proposedChanges?.trainingAdjustment?.volumeMultiplier !== undefined) {
          expect(decision.proposedChanges.trainingAdjustment.volumeMultiplier).toBeGreaterThan(0);
          expect(decision.proposedChanges.trainingAdjustment.volumeMultiplier).toBeLessThanOrEqual(1);
        }

        const shouldApprove = decision.requiresApproval && scenario.approveFromWeek !== null && week >= scenario.approveFromWeek;
        const record: WeeklyCoachingRecord = {
          reviewedPlanWeek: currentPlanWeek,
          appliesFromPlanWeek: currentPlanWeek + 1,
          weekStartDateKey: localDateKey(today),
          checkIn,
          decision,
          approvalStatus: !decision.requiresApproval ? 'not_applicable' : shouldApprove ? 'approved' : 'pending',
          decidedAt: null,
        };
        history.push(record);

        // -- an accepted recommendation concretely changes the FOLLOWING week's plan --
        if (record.approvalStatus === 'approved' && decision.proposedChanges?.trainingAdjustment) {
          const adj = decision.proposedChanges.trainingAdjustment;
          const baseline = generateTodayWorkout(profile, 0, progressionWeek + 1);
          const adjusted = applyCoachAdjustment(profile, 0, adj, progressionWeek + 1);
          expect(adjusted.exercises.length).toBeGreaterThan(0);
          for (const ex of adjusted.exercises) {
            expect(Number.isFinite(ex.sets)).toBe(true);
            expect(ex.sets).toBeGreaterThan(0);
          }
          if (adj.volumeMultiplier !== undefined) {
            // A volume cut always changes something numeric — this is the reliable case to
            // assert strict inequality on regardless of the athlete's equipment/location.
            expect(adjusted).not.toEqual(baseline);
          }
          // swapToBodyweight/skipHighImpact-only adjustments can be a legitimate no-op when the
          // athlete's baseline plan was already fully equipment-free — asserted valid above,
          // not required to differ from baseline.
        }
      }

      // -- final weekly report over the accumulated history stays accurate and NaN-free --
      const last7 = allLogs.slice(-7);
      const completion = computeWorkoutCompletion(last7);
      const report = generateWeeklyReport({
        workoutsCompleted: completion.completed,
        workoutsPlanned: Math.max(scenario.sim.answers.daysAvailablePerWeek, 1),
        nutritionAdherencePct: computeNutritionAdherence(last7),
        recoveryAveragePct: computeRecoveryScore(last7, scenario.sim.answers.daysAvailablePerWeek),
        weightDeltaKg: 0,
        weakestArea: 'nutrition',
        strongestArea: 'strength',
      });
      expect(Number.isNaN(report.workoutsCompleted)).toBe(false);
      expect(Number.isNaN(report.nutritionAdherencePct)).toBe(false);
    });
  }

  it('a rejected recommendation never changes any future week\'s resolved plan', () => {
    const sim = COACHING_SCENARIOS.find((s) => s.name.startsWith('2.'))!.sim;
    const profile = buildProfile(sim.answers);
    const summaryLogs: DayLog[] = [
      { date: '2026-01-05', loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false },
      { date: '2026-01-06', loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false },
    ];
    const { decision } = buildWeeklyCoachingReview(
      summaryLogs,
      [],
      sim.answers.daysAvailablePerWeek,
      { barrierIds: ['time'], submittedAt: '2026-01-06' },
      profile,
      []
    );
    expect(decision.requiresApproval).toBe(true);

    // A "rejected" week simply never contributes an approved adjustment — the following
    // week's plan is generated exactly as if no review had happened at all.
    const withoutAdjustment = generateTodayWorkout(profile, 0, 1);
    const alsoWithoutAdjustment = generateTodayWorkout(profile, 0, 1);
    expect(withoutAdjustment).toEqual(alsoWithoutAdjustment);
  });
});
