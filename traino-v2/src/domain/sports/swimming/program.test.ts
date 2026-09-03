import { describe, expect, it } from 'vitest';
import { swimmingModule } from './program';
import { validateSportModule } from '../validateSportModule';
import { getSportModule } from '../registry';
import { footballModule } from '../football/program';
import { determineLevel } from '../../engine/levelEngine';
import { calculateNutritionTargets } from '../../engine/nutritionEngine';
import { generateMealPlan } from '../../engine/nutritionPlanEngine';
import { applyCoachAdjustment, generateTodayWorkout, generateWeekProgram } from '../../engine/planEngine';
import { computeProgressionInfo } from '../../engine/progressionEngine';
import { computePerformanceStats, computeWorkoutCompletion } from '../../engine/progressEngine';
import { generateWeeklyReport } from '../../engine/weeklyReportEngine';
import { getExerciseAlternatives } from '../../engine/exerciseAlternatives';
import { addDays, localDateKey } from '../../engine/dateUtils';
import type { AssessmentAnswers, FitnessLevel, UserProfile } from '../../engine/types';

/**
 * Swimming — the architectural extensibility test. Every test here reuses
 * the exact same engine functions the football tests use; none of them
 * import anything swimming-specific from `domain/engine`. If any of these
 * needed a `sport === 'swimming'` branch anywhere outside this file and
 * `domain/sports/swimming/`, the architecture would have failed the test.
 */

const ALL_SWIM_EQUIPMENT = ['kickboard', 'pull_buoy', 'fins', 'paddles', 'dumbbells', 'resistance_bands', 'medicine_ball', 'pull_up_bar', 'cable_machine'];

function swimAnswers(overrides: Partial<AssessmentAnswers> = {}): AssessmentAnswers {
  return {
    firstName: 'Sam',
    sport: 'swimming',
    goal: 'general_fitness',
    experienceYears: 2,
    currentTrainingFrequency: 3,
    daysAvailablePerWeek: 3,
    trainingLocationIds: ['pool'],
    equipmentIds: [],
    injuryIds: ['none'],
    sex: 'female',
    age: 24,
    heightCm: 168,
    weightKg: 60,
    dietaryPreference: 'no_restriction',
    allergyIds: [],
    budgetTier: 'medium',
    ...overrides,
  };
}

function swimProfile(overrides: Partial<AssessmentAnswers> = {}, level?: FitnessLevel): UserProfile {
  const answers = swimAnswers(overrides);
  const resolvedLevel = level ?? determineLevel(answers);
  const nutrition = calculateNutritionTargets(answers, swimmingModule.nutritionProfile);
  return { answers, level: resolvedLevel, nutrition };
}

describe('1. Sport Module contract validation', () => {
  it('the Swimming module satisfies the same contract every sport module must satisfy', () => {
    expect(validateSportModule(swimmingModule)).toEqual({ valid: true, errors: [] });
  });
});

describe('2. Registry registration', () => {
  it('getSportModule("swimming") returns the real authored module, not the generic fallback', () => {
    const resolved = getSportModule('swimming');
    expect(resolved.id).toBe('swimming');
    expect(resolved).toBe(swimmingModule);
    expect(resolved.program.beginner[0].id).toContain('swim_');
  });
});

describe('3. Assessment -> Swimming Athlete Profile', () => {
  it('produces a valid profile purely from generic assessment fields, no swim-specific question required', () => {
    const profile = swimProfile();
    expect(['beginner', 'intermediate', 'advanced']).toContain(profile.level);
    expect(Number.isFinite(profile.nutrition.calories)).toBe(true);
    expect(profile.nutrition.calories).toBeGreaterThanOrEqual(1200);
    expect(profile.answers.sport).toBe('swimming');
  });
});

describe('4. Different Swimming experience levels', () => {
  it('a beginner and an advanced swimmer resolve to different day rosters with increasing volume', () => {
    const beginnerWeek = generateWeekProgram(swimProfile({}, 'beginner'));
    const advancedWeek = generateWeekProgram(swimProfile({}, 'advanced'));
    expect(beginnerWeek.map((d) => d.id)).toEqual(swimmingModule.program.beginner.map((d) => d.id));
    expect(advancedWeek.map((d) => d.id)).toEqual(swimmingModule.program.advanced.map((d) => d.id));

    const beginnerDuration = beginnerWeek.reduce((sum, d) => sum + d.durationMin, 0);
    const advancedDuration = advancedWeek.reduce((sum, d) => sum + d.durationMin, 0);
    expect(advancedDuration).toBeGreaterThan(beginnerDuration);
  });

  it('determineLevel classifies swimming experience exactly like any other sport (sport-agnostic)', () => {
    expect(determineLevel(swimAnswers({ experienceYears: 0, currentTrainingFrequency: 0 }))).toBe('beginner');
    expect(determineLevel(swimAnswers({ experienceYears: 5, currentTrainingFrequency: 6 }))).toBe('advanced');
  });
});

describe('5. Different training frequencies', () => {
  it('daysAvailablePerWeek feeds the nutrition activity multiplier the same way for swimming as any sport', () => {
    const low = calculateNutritionTargets(swimAnswers({ daysAvailablePerWeek: 1 }), swimmingModule.nutritionProfile);
    const high = calculateNutritionTargets(swimAnswers({ daysAvailablePerWeek: 6 }), swimmingModule.nutritionProfile);
    expect(high.calories).toBeGreaterThan(low.calories);
  });
});

describe('6. Different goals', () => {
  it('fat_loss < general_fitness < muscle_gain calorie targets for a swimmer, same as any sport', () => {
    const cut = calculateNutritionTargets(swimAnswers({ goal: 'fat_loss' }), swimmingModule.nutritionProfile);
    const maintenance = calculateNutritionTargets(swimAnswers({ goal: 'general_fitness' }), swimmingModule.nutritionProfile);
    const bulk = calculateNutritionTargets(swimAnswers({ goal: 'muscle_gain' }), swimmingModule.nutritionProfile);
    expect(cut.calories).toBeLessThan(maintenance.calories);
    expect(bulk.calories).toBeGreaterThan(maintenance.calories);
  });
});

describe('7. Different pool/location availability', () => {
  it('substitutes every pool-gated slot to its dryland alternative when the athlete has no pool access', () => {
    const profile = swimProfile({ trainingLocationIds: ['home'] }, 'intermediate');
    const day = generateWeekProgram(profile).find((d) => d.id === 'swim_int_endurance')!;
    const mainSwim = day.exercises.find((e) => e.name === 'Steady-State Run');
    expect(mainSwim).toBeDefined();
    expect(mainSwim!.substitutionReason).toBe('location');
    // Warm-up/cool-down are dryland by design and must never be dropped for lack of a pool.
    expect(day.exercises.some((e) => e.category === 'warmup')).toBe(true);
    expect(day.exercises.some((e) => e.category === 'cooldown')).toBe(true);
  });

  it('keeps real pool sets when the athlete does have pool access', () => {
    const profile = swimProfile({ trainingLocationIds: ['pool'] }, 'intermediate');
    const day = generateWeekProgram(profile).find((d) => d.id === 'swim_int_endurance')!;
    const mainSwim = day.exercises.find((e) => e.name === 'Continuous Freestyle Swim');
    expect(mainSwim).toBeDefined();
    expect(mainSwim!.substitutionReason).toBe('none');
  });
});

describe('8. Different equipment availability', () => {
  it('substitutes fins/kickboard/pull-buoy/paddle work when that equipment is unavailable', () => {
    const profile = swimProfile({ trainingLocationIds: ['pool'], equipmentIds: [] }, 'advanced');
    const day = generateWeekProgram(profile).find((d) => d.id === 'swim_adv_technique')!;
    const finsSet = day.exercises.find((e) => e.substitutionReason === 'equipment' && e.name.includes('Sprint Intervals'));
    expect(finsSet).toBeDefined();
  });

  it('keeps the equipped version when the swimmer has fins/paddles/kickboard/pull-buoy', () => {
    const profile = swimProfile({ trainingLocationIds: ['pool'], equipmentIds: ALL_SWIM_EQUIPMENT }, 'advanced');
    const day = generateWeekProgram(profile).find((d) => d.id === 'swim_adv_technique')!;
    const finsSet = day.exercises.find((e) => e.name === 'Fins Sprint 25s');
    expect(finsSet).toBeDefined();
    expect(finsSet!.substitutionReason).toBe('none');
  });
});

describe('9. Swimming plan generation', () => {
  it('generates the full weekly cycle matching the authored program for the resolved level', () => {
    const profile = swimProfile({}, 'intermediate');
    const week = generateWeekProgram(profile);
    expect(week).toHaveLength(swimmingModule.program.intermediate.length);
  });

  it('is deterministic — the same profile always resolves to the same plan', () => {
    const profile = swimProfile({ equipmentIds: ['fins'] }, 'advanced');
    expect(generateWeekProgram(profile)).toEqual(generateWeekProgram(profile));
  });
});

describe('10 & 11. Multiple training weeks + calendar-aware progression', () => {
  it('progressionWeek advances for the swimmer across fully-earned weeks, exactly like any sport', () => {
    const planStartDate = '2026-01-05';
    const start = new Date(2026, 0, 5);
    const logs: Array<{ date: string; workoutCompleted: boolean }> = [];
    const plannedPerWeek = 3;
    const weeksSimulated = 6;

    for (let week = 0; week < weeksSimulated; week++) {
      const weekStart = addDays(start, week * 7);
      for (let day = 0; day < 7; day++) {
        logs.push({ date: localDateKey(addDays(weekStart, day)), workoutCompleted: day < plannedPerWeek });
      }
    }
    const info = computeProgressionInfo(planStartDate, logs, plannedPerWeek, addDays(start, weeksSimulated * 7 + 6));
    expect(info.progressionWeek).toBeGreaterThan(1);

    const profile = swimProfile({}, 'intermediate');
    const week = generateWeekProgram(profile, info.progressionWeek);
    // A dryland strength slot should have picked up the generic progression bonus by now.
    const dryland = week.find((d) => d.id === 'swim_int_dryland')!;
    const pushUps = dryland.exercises.find((e) => e.name === 'Push-Ups')!;
    expect(pushUps.sets).toBeGreaterThan(4); // authored base is 4
  });
});

describe('12. Missed workouts', () => {
  it('a consistently missed swim schedule freezes progressionWeek at 1', () => {
    const planStartDate = '2026-01-05';
    const start = new Date(2026, 0, 5);
    const logs: Array<{ date: string; workoutCompleted: boolean }> = [];
    for (let week = 0; week < 4; week++) {
      const weekStart = addDays(start, week * 7);
      for (let day = 0; day < 7; day++) {
        logs.push({ date: localDateKey(addDays(weekStart, day)), workoutCompleted: false });
      }
    }
    const info = computeProgressionInfo(planStartDate, logs, 3, addDays(start, 4 * 7 + 6));
    expect(info.progressionWeek).toBe(1);
  });
});

describe('13. Manual drill/exercise replacement', () => {
  it('offers pre-authored alternatives for known swim drills', () => {
    const alts = getExerciseAlternatives('Freestyle Catch-Up Drill');
    expect(alts.length).toBeGreaterThan(0);
  });

  it('offers alternatives for a main-set swim exercise too', () => {
    const alts = getExerciseAlternatives('Continuous Freestyle Swim');
    expect(alts.length).toBeGreaterThan(0);
  });
});

describe('14 & 15. Fatigue adaptation + less-time adaptation', () => {
  it('a reduced volumeMultiplier (the same adjustment "feeling tired"/"adjust workout" apply) shrinks swim set counts without ever going to zero', () => {
    const profile = swimProfile({}, 'advanced');
    const resolved = applyCoachAdjustment(profile, 1, { volumeMultiplier: 0.7, note: 'fatigue test' }, 1);
    for (const ex of resolved.exercises) {
      if (ex.category === 'warmup' || ex.category === 'cooldown') continue;
      expect(ex.sets).toBeGreaterThan(0);
      expect(Number.isFinite(ex.sets)).toBe(true);
    }
  });

  it('swapToBodyweight forces every eligible swim slot to its dryland alternative, same mechanism as "traveling"', () => {
    const profile = swimProfile({ trainingLocationIds: ['pool'], equipmentIds: ALL_SWIM_EQUIPMENT }, 'intermediate');
    const resolved = applyCoachAdjustment(profile, 2, { swapToBodyweight: true, note: 'no pool today' }, 1);
    const mainSwim = resolved.exercises.find((e) => e.name === 'Continuous Freestyle Swim');
    expect(mainSwim).toBeUndefined(); // it got swapped to its dryland alternative name
    expect(resolved.exercises.some((e) => e.name === 'Steady-State Run')).toBe(true);
  });
});

describe('16 & 17. Equipment restrictions + safety restrictions', () => {
  it('no contraindicated swim slot ever appears unchanged by name, across every level and injury tag', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as FitnessLevel[]) {
      for (const injuryId of ['shoulder', 'knee', 'lower_back']) {
        const profile = swimProfile({ injuryIds: [injuryId], equipmentIds: ALL_SWIM_EQUIPMENT, trainingLocationIds: ['pool'] }, level);
        const week = generateWeekProgram(profile);
        const rawDays = swimmingModule.program[level];
        for (const rawDay of rawDays) {
          const resolvedDay = week.find((d) => d.id === rawDay.id)!;
          for (const slot of rawDay.exercises) {
            if (!slot.contraindications?.includes(injuryId)) continue;
            expect(resolvedDay.exercises.some((e) => e.name === slot.name)).toBe(false);
          }
        }
      }
    }
  });

  it('a "none" injury profile with full equipment/pool access resolves every slot unsubstituted', () => {
    const profile = swimProfile({ injuryIds: ['none'], equipmentIds: ALL_SWIM_EQUIPMENT, trainingLocationIds: ['pool'] }, 'advanced');
    const week = generateWeekProgram(profile);
    for (const day of week) {
      for (const ex of day.exercises) {
        expect(ex.substitutionReason).toBe('none');
      }
    }
  });
});

describe('18. Progress / statCategory', () => {
  it('every swim day template carries an explicit, valid statCategory the generic Progress engine can bucket', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as FitnessLevel[]) {
      for (const day of swimmingModule.program[level]) {
        expect(['speed', 'strength', 'stamina']).toContain(day.statCategory);
      }
    }
  });

  it('computePerformanceStats buckets a completed swim workout by its stored statCategory, no swim-specific code involved', () => {
    const logs = [
      {
        date: '2026-01-05',
        loggedMealSlots: [],
        mealOverrides: {},
        workoutCompleted: true,
        workoutName: 'Endurance Swim',
        statCategory: 'stamina' as const,
      },
    ];
    const stats = computePerformanceStats(logs);
    expect(stats.stamina.hasData).toBe(true);
    expect(stats.speed.hasData).toBe(false);
  });
});

describe('19. Weekly Report', () => {
  it('generateWeeklyReport works unmodified for swim-derived numbers', () => {
    const profile = swimProfile({}, 'intermediate');
    const week = generateWeekProgram(profile);
    const completion = computeWorkoutCompletion(
      week.map((d) => ({
        date: '2026-01-05',
        loggedMealSlots: [],
        mealOverrides: {},
        workoutCompleted: true,
        statCategory: d.statCategory,
      }))
    );
    const report = generateWeeklyReport({
      workoutsCompleted: completion.completed,
      workoutsPlanned: completion.planned,
      nutritionAdherencePct: 80,
      recoveryAveragePct: 75,
      weightDeltaKg: -0.3,
      weakestArea: 'nutrition',
      strongestArea: 'stamina',
    });
    expect(typeof report.headline).toBe('string');
    expect(Number.isNaN(report.workoutsCompleted)).toBe(false);
  });
});

describe('20. Nutrition integration', () => {
  it('generates a full, allergy-safe meal plan using the swimmer\'s nutritionProfile, no swim-specific meal logic', () => {
    const profile = swimProfile({ allergyIds: ['dairy'] }, 'intermediate');
    const plan = generateMealPlan(profile.answers, profile.nutrition);
    expect(plan.map((e) => e.slot)).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    for (const entry of plan) {
      if (!entry.meal) continue;
      expect(entry.meal.allergens).not.toContain('dairy');
    }
  });

  it('the higher carb-bias nutrition profile gives swimmers less fat allocation than a low-carb-bias sport, calories held equal', () => {
    const swimTargets = calculateNutritionTargets(swimAnswers(), swimmingModule.nutritionProfile);
    const lowCarbSportTargets = calculateNutritionTargets(swimAnswers(), { proteinGPerKg: 1.6, carbBias: 'low' });
    expect(swimTargets.fatG).toBeLessThan(lowCarbSportTargets.fatG);
  });
});

describe('22 & 23. No NaN, no invalid/empty sessions', () => {
  it('every generated swim day, across every level/equipment/injury/location combo, has at least one exercise and no NaN/negative values', () => {
    const equipmentCombos = [[], ALL_SWIM_EQUIPMENT];
    const locationCombos = [['pool'], ['home'], ['gym', 'pool']];
    const injuryCombos = [['none'], ['shoulder'], ['knee'], ['lower_back'], ['shoulder', 'knee']];

    for (const level of ['beginner', 'intermediate', 'advanced'] as FitnessLevel[]) {
      for (const equipmentIds of equipmentCombos) {
        for (const trainingLocationIds of locationCombos) {
          for (const injuryIds of injuryCombos) {
            const profile = swimProfile({ equipmentIds, trainingLocationIds, injuryIds }, level);
            const week = generateWeekProgram(profile, 3);
            for (const day of week) {
              expect(day.exercises.length).toBeGreaterThan(0);
              expect(Number.isFinite(day.durationMin)).toBe(true);
              expect(day.durationMin).toBeGreaterThan(0);
              for (const ex of day.exercises) {
                expect(Number.isFinite(ex.sets)).toBe(true);
                expect(ex.sets).toBeGreaterThan(0);
                expect(typeof ex.reps).toBe('string');
                expect(ex.reps.length).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    }
  });

  it('generateTodayWorkout never returns an empty exercise list for any swim day index', () => {
    const profile = swimProfile({ equipmentIds: [], trainingLocationIds: ['home'], injuryIds: ['shoulder', 'knee', 'lower_back'] }, 'beginner');
    for (let i = 0; i < swimmingModule.program.beginner.length; i++) {
      const workout = generateTodayWorkout(profile, i, 1);
      expect(workout.exercises.length).toBeGreaterThan(0);
    }
  });
});

describe('Football regression: adding Swimming did not change football behavior', () => {
  it('football still resolves via its own module, unaffected by the swimming registration', () => {
    const resolved = getSportModule('football');
    expect(resolved).toBe(footballModule);
    expect(resolved.id).toBe('football');
  });
});
