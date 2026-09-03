import { describe, expect, it } from 'vitest';
import { determineLevel } from './engine/levelEngine';
import { calculateNutritionTargets } from './engine/nutritionEngine';
import { generateMealPlan } from './engine/nutritionPlanEngine';
import { generateWeekProgram } from './engine/planEngine';
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
        // ever appear unchanged by name in the resolved plan.
        if (sim.answers.sport === 'football') {
          const rawDays = footballModule.program[profile.level];
          for (const rawDay of rawDays) {
            const resolvedDay = weekProgram.find((d) => d.id === rawDay.id);
            if (!resolvedDay) continue;
            for (const slot of rawDay.exercises) {
              const flagged = slot.contraindications?.some((tag) => sim.answers.injuryIds.includes(tag));
              if (!flagged) continue;
              expect(resolvedDay.exercises.some((e) => e.name === slot.name)).toBe(false);
            }
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
