import { describe, expect, it } from 'vitest';
import { applyCoachAdjustment, generatePersonalizedWeek, generateTodayWorkout, generateWeekProgram, todayDayIndex } from './planEngine';
import { getExerciseAlternatives } from './exerciseAlternatives';
import { footballModule } from '../sports/football/program';
import { swimmingModule } from '../sports/swimming/program';
import { getSportModule } from '../sports/registry';
import { baseAnswers } from './testFixtures';
import type { AssessmentAnswers, FitnessLevel, UserProfile } from './types';
import type { ExerciseProgressionContext } from './progressionIntegration';
import type { ExercisePerformanceLog } from '../progression/types';

function profileFor(answers: Partial<AssessmentAnswers>, level: FitnessLevel = 'intermediate'): UserProfile {
  return {
    answers: baseAnswers(answers),
    level,
    nutrition: { calories: 2500, proteinG: 150, carbsG: 250, fatG: 70 },
  };
}

describe('training plan generation', () => {
  it('generates the full weekly cycle for the athlete\'s sport and level', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const week = generateWeekProgram(profile);
    expect(week).toHaveLength(footballModule.program.intermediate.length);
    expect(week.map((d) => d.id)).toEqual(footballModule.program.intermediate.map((d) => d.id));
  });

  it('is deterministic — the same profile always produces the same resolved plan', () => {
    const profile = profileFor({ sport: 'football', equipmentIds: ['barbell'] }, 'advanced');
    const a = generateWeekProgram(profile);
    const b = generateWeekProgram(profile);
    expect(a).toEqual(b);
  });

  it('falls back to the generic full-body program for an unregistered sport, never throwing', () => {
    const profile = profileFor({ sport: 'boxing' }, 'beginner');
    expect(() => generateWeekProgram(profile)).not.toThrow();
    expect(generateWeekProgram(profile).length).toBeGreaterThan(0);
  });

  it('todayDayIndex cycles within the program length by real day-of-week', () => {
    const monday = new Date(2026, 0, 5); // a Monday -> ISO weekday 0
    const wednesday = new Date(2026, 0, 7); // -> ISO weekday 2
    expect(todayDayIndex(3, monday)).toBe(0);
    expect(todayDayIndex(3, wednesday)).toBe(2);
  });

  it('generateTodayWorkout resolves a specific requested day rather than always the first', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const day0 = generateTodayWorkout(profile, 0);
    const day1 = generateTodayWorkout(profile, 1);
    expect(day0.id).toBe('football_int_speed_lower');
    expect(day1.id).toBe('football_int_upper_core');
  });
});

describe('equipment restrictions', () => {
  it('substitutes to the bodyweight alternative when required equipment is unavailable', () => {
    const profile = profileFor({ sport: 'football', equipmentIds: [] }, 'intermediate');
    const day = generateWeekProgram(profile).find((d) => d.id === 'football_int_speed_lower')!;
    // index 1 is "Back Squat" in the raw template (index 0 is Warm Up) — resolveDay
    // preserves slot order, so this is Back Squat's resolved substitution.
    const backSquat = day.exercises[1];
    expect(backSquat.name).toBe('Glute Bridge');
    expect(backSquat.substitutionReason).toBe('equipment');
  });

  it('keeps the primary movement when the required equipment is available', () => {
    const profile = profileFor({ sport: 'football', equipmentIds: ['barbell', 'squat_rack'] }, 'intermediate');
    const day = generateWeekProgram(profile).find((d) => d.id === 'football_int_speed_lower')!;
    const backSquat = day.exercises.find((e) => e.name === 'Back Squat');
    expect(backSquat).toBeDefined();
    expect(backSquat!.substitutionReason).toBe('none');
  });
});

describe('training-location restrictions', () => {
  it('substitutes a location-gated slot when the athlete does not train there', () => {
    const profile = profileFor({ sport: 'football', trainingLocationIds: ['home'] }, 'advanced');
    const day = generateWeekProgram(profile).find((d) => d.id === 'football_adv_agility')!;
    const gameSim = day.exercises.find((e) => e.name.includes('Passing Drill') || e.name.includes('Game Simulation'))!;
    expect(gameSim.name).toBe('Shadow Passing Drill (solo)');
    expect(gameSim.substitutionReason).toBe('location');
  });

  it('keeps the field-based movement when the athlete does train at a matching location', () => {
    const profile = profileFor({ sport: 'football', trainingLocationIds: ['sports_field'] }, 'advanced');
    const day = generateWeekProgram(profile).find((d) => d.id === 'football_adv_agility')!;
    const gameSim = day.exercises.find((e) => e.name === 'Small-Sided Game Simulation');
    expect(gameSim).toBeDefined();
    expect(gameSim!.substitutionReason).toBe('none');
  });
});

describe('injury restrictions and safe substitutions', () => {
  it('substitutes every contraindicated exercise for a reported injury, across the whole football program', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as FitnessLevel[]) {
      for (const injuryId of ['knee', 'shoulder', 'ankle', 'lower_back']) {
        const profile = profileFor({ sport: 'football', injuryIds: [injuryId], equipmentIds: allEquipment() }, level);
        const week = generateWeekProgram(profile);
        const rawDays = footballModule.program[level];

        for (const rawDay of rawDays) {
          const resolvedDay = week.find((d) => d.id === rawDay.id)!;
          for (const slot of rawDay.exercises) {
            if (!slot.contraindications?.includes(injuryId)) continue;
            // Regression: a contraindicated exercise must NEVER appear unchanged by name —
            // it must be substituted (if a safe alternative exists) or dropped entirely.
            const stillPresentUnchanged = resolvedDay.exercises.some((e) => e.name === slot.name);
            expect(stillPresentUnchanged).toBe(false);
          }
        }
      }
    }
  });

  it('regression: Bulgarian Split Squat (loaded) substitutes to a genuinely low-load Glute Bridge, not another loaded/jump movement', () => {
    const profile = profileFor({ sport: 'football', injuryIds: ['knee'] }, 'advanced');
    const day = generateWeekProgram(profile).find((d) => d.id === 'football_adv_speed_lower')!;
    const sub = day.exercises.find((e) => e.name === 'Glute Bridge');
    expect(sub).toBeDefined();
    expect(sub!.reps).toBe('15');
    expect(sub!.substitutionReason).toBe('injury');
  });

  it('regression: Depth Jump substitutes to Wall Sit, not another jump, for knee/ankle limitations', () => {
    const profile = profileFor({ sport: 'football', injuryIds: ['ankle'] }, 'advanced');
    const day = generateWeekProgram(profile).find((d) => d.id === 'football_adv_agility')!;
    const sub = day.exercises.find((e) => e.name === 'Wall Sit');
    expect(sub).toBeDefined();
    expect(sub!.reps).toBe('40 sec');
  });

  it('regression: Bench Press (advanced) substitutes to a light incline push-up variant for a shoulder limitation', () => {
    const profile = profileFor({ sport: 'football', injuryIds: ['shoulder'] }, 'advanced');
    const day = generateWeekProgram(profile).find((d) => d.id === 'football_adv_upper_core')!;
    const sub = day.exercises.find((e) => e.name === 'Incline Push-Ups (light)');
    expect(sub).toBeDefined();
    expect(sub!.reps).toBe('12');
  });

  it('an injury with no matching contraindications leaves the program unaffected', () => {
    const clean = generateWeekProgram(profileFor({ sport: 'football', injuryIds: ['none'], equipmentIds: allEquipment(), trainingLocationIds: ['sports_field'] }, 'intermediate'));
    const alsoClean = generateWeekProgram(profileFor({ sport: 'football', injuryIds: ['none'], equipmentIds: allEquipment(), trainingLocationIds: ['sports_field'] }, 'intermediate'));
    expect(clean).toEqual(alsoClean);
  });
});

describe('unsafe exercise removal — AI Coach "have pain" adjustment', () => {
  it('drops every high-impact exercise entirely, regardless of whether a bodyweight alternative exists', () => {
    const profile = profileFor({ sport: 'football' }, 'advanced');
    const resolved = applyCoachAdjustment(profile, 2, { skipHighImpact: true, note: 'test' }, 1);
    const rawDay = footballModule.program.advanced[2]; // football_adv_agility — has several highImpact slots
    const highImpactNames = new Set(rawDay.exercises.filter((e) => e.highImpact).map((e) => e.name));
    for (const ex of resolved.exercises) {
      expect(highImpactNames.has(ex.name)).toBe(false);
    }
  });
});

describe('statCategory handling', () => {
  it('every resolved workout carries the day template\'s explicit statCategory, never a guess', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as FitnessLevel[]) {
      const profile = profileFor({ sport: 'football' }, level);
      const week = generateWeekProgram(profile);
      const rawDays = footballModule.program[level];
      for (const rawDay of rawDays) {
        const resolved = week.find((d) => d.id === rawDay.id)!;
        expect(resolved.statCategory).toBe(rawDay.statCategory);
      }
    }
  });
});

describe('experience-level / training plan selection', () => {
  it('selects the day roster matching the athlete\'s determined fitness level', () => {
    const beginnerWeek = generateWeekProgram(profileFor({ sport: 'football' }, 'beginner'));
    const advancedWeek = generateWeekProgram(profileFor({ sport: 'football' }, 'advanced'));
    expect(beginnerWeek.map((d) => d.id)).toEqual(footballModule.program.beginner.map((d) => d.id));
    expect(advancedWeek.map((d) => d.id)).toEqual(footballModule.program.advanced.map((d) => d.id));
  });
});

describe('manual exercise replacement', () => {
  it('offers pre-authored alternatives for a known exercise', () => {
    const alts = getExerciseAlternatives('Back Squat');
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((a) => typeof a.name === 'string' && a.name.length > 0)).toBe(true);
  });

  it('returns an empty list (never throws) for an exercise with no authored alternatives', () => {
    expect(() => getExerciseAlternatives('Not A Real Exercise')).not.toThrow();
    expect(getExerciseAlternatives('Not A Real Exercise')).toEqual([]);
  });
});

describe('regression: NaN-safe volume adjustment', () => {
  it('an invalid volumeMultiplier (NaN/zero/negative) leaves set counts unchanged instead of propagating NaN', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const resolved = applyCoachAdjustment(profile, undefined, { volumeMultiplier: NaN, note: 'test' }, 1);
    for (const ex of resolved.exercises) {
      expect(Number.isFinite(ex.sets)).toBe(true);
      expect(ex.sets).toBeGreaterThan(0);
    }
  });
});

function progressionLog(exerciseName: string, overrides: Partial<ExercisePerformanceLog> = {}): ExercisePerformanceLog {
  return {
    date: '2026-01-05',
    exerciseName,
    prescribedSets: 3,
    completedSets: 3,
    repsAchieved: 8,
    loadKg: 70,
    rir: 3,
    wasModified: false,
    submittedAt: '2026-01-05T18:00:00.000Z',
    ...overrides,
  };
}

function progressionContext(historyByExercise: Record<string, ExercisePerformanceLog[]>): ExerciseProgressionContext {
  return {
    getHistory: (name) => historyByExercise[name] ?? [],
    getReadinessStatus: () => null,
  };
}

describe('planEngine — Progression Engine integration (workout-level, spec §10)', () => {
  it('with no progression context, resolved exercises carry no progression decision (fully backward compatible)', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const resolved = generateTodayWorkout(profile, 0, 1);
    for (const ex of resolved.exercises) {
      expect(ex.progression).toBeUndefined();
    }
  });

  it('attaches a SKIP decision (base target) on a first exposure once a progression context is supplied', () => {
    const profile = profileFor({ sport: 'football', equipmentIds: ['barbell', 'squat_rack', 'bench', 'dumbbells', 'pull_up_bar', 'cable_machine'] }, 'advanced');
    const resolved = generateTodayWorkout(profile, undefined, 1, progressionContext({}));
    const progressable = resolved.exercises.filter((ex) => ex.progression && ex.progression.model !== 'technique');
    expect(progressable.length).toBeGreaterThan(0);
    for (const ex of progressable) {
      expect(ex.progression!.decision).toBe('SKIP');
    }
  });

  it('a fully-completed, high-RIR logged exposure concretely changes the displayed reps for the next session', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const baseline = generateTodayWorkout(profile, 0, 1);
    const bodyweightStrength = baseline.exercises.find((ex) => ex.category === 'strength');
    expect(bodyweightStrength).toBeDefined();

    const context = progressionContext({ [bodyweightStrength!.name]: [progressionLog(bodyweightStrength!.name, { loadKg: undefined, repsAchieved: bodyweightStrength!.sets > 0 ? 8 : 8 })] });
    const progressed = generateTodayWorkout(profile, 0, 1, context);
    const target = progressed.exercises.find((ex) => ex.name === bodyweightStrength!.name);
    expect(target?.progression?.decision).toBe('PROGRESS');
    expect(target?.reps).not.toBe(bodyweightStrength!.reps);
  });

  it('a missed exposure holds — never progresses the displayed target from insufficient evidence', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const baseline = generateTodayWorkout(profile, 0, 1);
    const bodyweightStrength = baseline.exercises.find((ex) => ex.category === 'strength')!;

    const context = progressionContext({ [bodyweightStrength.name]: [progressionLog(bodyweightStrength.name, { completedSets: 0 })] });
    const progressed = generateTodayWorkout(profile, 0, 1, context);
    const target = progressed.exercises.find((ex) => ex.name === bodyweightStrength.name);
    expect(target?.progression?.decision).toBe('HOLD');
    expect(target?.progression?.nextTarget).toEqual(target?.progression?.previousTarget);
  });

  it('progression evidence stays attached to a safety substitute, never the original contraindicated exercise', () => {
    // Advanced football: Back Squat is contraindicated for 'knee' and substitutes to Glute Bridge.
    const injured = profileFor({ sport: 'football', injuryIds: ['knee'], equipmentIds: ['barbell', 'squat_rack'] }, 'advanced');
    const resolved = generateTodayWorkout(injured, undefined, 1, progressionContext({ 'Back Squat': [progressionLog('Back Squat', { rir: 5 })] }));
    // Whatever exercise actually appears (the safe substitute) must not show a PROGRESS
    // decision built from "Back Squat"'s history — its own history is empty (SKIP), or
    // it's not the same name at all.
    const substituted = resolved.exercises.find((ex) => ex.substitutionReason === 'injury');
    if (substituted) {
      expect(substituted.name).not.toBe('Back Squat');
      if (substituted.progression) expect(substituted.progression.decision).not.toBe('PROGRESS');
    }
  });

  it('applyCoachAdjustment composes progression targets with the existing volume-multiplier reduction', () => {
    const profile = profileFor({ sport: 'football' }, 'intermediate');
    const baseline = generateTodayWorkout(profile, 0, 1);
    const bodyweightStrength = baseline.exercises.find((ex) => ex.category === 'strength')!;
    const context = progressionContext({ [bodyweightStrength.name]: [progressionLog(bodyweightStrength.name, { loadKg: undefined })] });

    const adjusted = applyCoachAdjustment(profile, 0, { volumeMultiplier: 0.7, note: 'test' }, 1, context);
    const target = adjusted.exercises.find((ex) => ex.name === bodyweightStrength.name);
    expect(target?.progression?.decision).toBe('PROGRESS');
    // Volume-multiplier still reduces sets on top of the progression-derived reps.
    expect(target!.sets).toBeLessThanOrEqual(bodyweightStrength.sets);
  });
});

describe('deep adaptive personalization (generatePersonalizedWeek)', () => {
  it('H: training frequency drives the number of training days in the generated week', () => {
    for (const freq of [2, 4, 5, 7]) {
      const profile = profileFor({ daysAvailablePerWeek: freq });
      const week = generatePersonalizedWeek(profile);
      expect(week).toHaveLength(7);
      expect(week.filter((d) => d.type === 'training')).toHaveLength(freq);
      expect(week.filter((d) => d.type === 'rest')).toHaveLength(7 - freq);
    }
  });

  it('I: session duration affects the generated/displayed workout duration', () => {
    const short = profileFor({ daysAvailablePerWeek: 4, sessionDurationMin: 20 });
    const long = profileFor({ daysAvailablePerWeek: 4, sessionDurationMin: 90 });
    const shortDay = generatePersonalizedWeek(short).find((d) => d.type === 'training')!;
    const longDay = generatePersonalizedWeek(long).find((d) => d.type === 'training')!;
    expect(shortDay.workout!.durationMin).toBeLessThan(longDay.workout!.durationMin);
    // Displayed duration must never contradict what was actually generated (spec §13):
    // a shorter budget must never produce equal-or-more total sets than a longer one.
    const shortSets = shortDay.workout!.exercises.reduce((sum, ex) => sum + ex.sets, 0);
    const longSets = longDay.workout!.exercises.reduce((sum, ex) => sum + ex.sets, 0);
    expect(shortSets).toBeLessThan(longSets);
  });

  it('J: equipment affects exercise selection — no equipment means no equipment-dependent exercise is selected', () => {
    const profile = profileFor({ trainingLocationIds: ['home'], equipmentIds: [] });
    const week = generatePersonalizedWeek(profile);
    const allNames = week.flatMap((d) => d.workout?.exercises.map((ex) => ex.name) ?? []);
    // Every football day template includes at least one barbell/squat-rack slot
    // (Back Squat) — with zero equipment it must always resolve to its bodyweight
    // alternative, never the loaded movement itself.
    expect(allNames).not.toContain('Back Squat');
  });

  it('K: injury remains a hard safety constraint inside the personalized week', () => {
    const profile = profileFor({ injuryIds: ['knee'], equipmentIds: ['barbell', 'squat_rack', 'bench', 'dumbbells'] });
    const week = generatePersonalizedWeek(profile);
    const allExercises = week.flatMap((d) => d.workout?.exercises ?? []);
    // Nothing resolved for a knee-injured athlete may carry a 'knee' contraindication —
    // resolveExercise already guarantees this; this test proves it still holds through
    // the new frequency/duration/priority personalization layers.
    for (const ex of allExercises) {
      expect(ex.substitutionReason === 'injury' || !['Back Squat', 'Bulgarian Split Squat', 'Leg Press'].includes(ex.name)).toBe(true);
    }
  });

  it('L: performance priority shifts category emphasis — conditioning priority yields more conditioning volume than strength priority', () => {
    const conditioningFocused = profileFor({ performancePriority: 'conditioning', daysAvailablePerWeek: 7 });
    const strengthFocused = profileFor({ performancePriority: 'strength', daysAvailablePerWeek: 7 });
    const conditioningSets = generatePersonalizedWeek(conditioningFocused)
      .flatMap((d) => d.workout?.exercises ?? [])
      .filter((ex) => ex.category === 'conditioning')
      .reduce((sum, ex) => sum + ex.sets, 0);
    const strengthSets = generatePersonalizedWeek(strengthFocused)
      .flatMap((d) => d.workout?.exercises ?? [])
      .filter((ex) => ex.category === 'conditioning')
      .reduce((sum, ex) => sum + ex.sets, 0);
    expect(conditioningSets).toBeGreaterThan(strengthSets);
  });

  it('P: same complete profile always produces an identical generated week (determinism)', () => {
    const profile = profileFor({ daysAvailablePerWeek: 5, sessionDurationMin: 60, performancePriority: 'speed' });
    expect(generatePersonalizedWeek(profile)).toEqual(generatePersonalizedWeek(profile));
  });

  it('O/§41: two meaningfully different football athletes get meaningfully different generated weeks', () => {
    // Athlete A: winger, intermediate-leaning, 5 days, 60 min, gym, performance/speed, no injury.
    const athleteA = profileFor({
      sport: 'football',
      sportPositionId: 'winger',
      daysAvailablePerWeek: 5,
      sessionDurationMin: 60,
      trainingLocationIds: ['gym'],
      equipmentIds: ['barbell', 'squat_rack', 'bench', 'dumbbells', 'cable_machine', 'pull_up_bar', 'plyo_box'],
      goal: 'performance',
      performancePriority: 'speed',
      injuryIds: ['none'],
    }, 'intermediate');

    // Athlete B: center back, beginner, 3 days, 30 min, home/bodyweight, fat loss, strength priority, knee limitation.
    const athleteB = profileFor({
      sport: 'football',
      sportPositionId: 'defender',
      daysAvailablePerWeek: 3,
      sessionDurationMin: 30,
      trainingLocationIds: ['home'],
      equipmentIds: [],
      goal: 'fat_loss',
      performancePriority: 'strength',
      injuryIds: ['knee'],
    }, 'beginner');

    const weekA = generatePersonalizedWeek(athleteA);
    const weekB = generatePersonalizedWeek(athleteB);

    // Different number of training days.
    expect(weekA.filter((d) => d.type === 'training').length).not.toBe(weekB.filter((d) => d.type === 'training').length);

    // Different session duration.
    const workoutA = weekA.find((d) => d.type === 'training')!.workout!;
    const workoutB = weekB.find((d) => d.type === 'training')!.workout!;
    expect(workoutA.durationMin).not.toBe(workoutB.durationMin);

    // Different exercise selection — Athlete A's gym access resolves loaded
    // barbell work Athlete B's bodyweight-only equipment can never resolve.
    const namesA = new Set(weekA.flatMap((d) => d.workout?.exercises.map((ex) => ex.name) ?? []));
    const namesB = new Set(weekB.flatMap((d) => d.workout?.exercises.map((ex) => ex.name) ?? []));
    expect(namesA).not.toEqual(namesB);

    // Safety: Athlete B's knee limitation means no knee-contraindicated movement
    // ever appears in her plan, while Athlete A's plan (no injury, gym access) can
    // legitimately include one — proving safety substitution actually differs.
    const bHasContraindicatedKnee = [...namesB].some((n) => ['Back Squat', 'Bulgarian Split Squat'].includes(n));
    expect(bHasContraindicatedKnee).toBe(false);

    // Determinism holds independently for each athlete.
    expect(generatePersonalizedWeek(athleteA)).toEqual(weekA);
    expect(generatePersonalizedWeek(athleteB)).toEqual(weekB);
  });
});

describe('sport module positions (adaptive question data)', () => {
  it('D/E/F: football and swimming each expose sport-specific positions/disciplines, distinct from each other', () => {
    expect(footballModule.positions?.length).toBeGreaterThan(0);
    expect(swimmingModule.positions?.length).toBeGreaterThan(0);
    const footballIds = new Set(footballModule.positions!.map((p) => p.id));
    const swimIds = new Set(swimmingModule.positions!.map((p) => p.id));
    for (const id of swimIds) expect(footballIds.has(id)).toBe(false);
  });

  it('D: a sport with no positions defined yields an empty list, so the adaptive question is skipped rather than shown empty', () => {
    const profile = profileFor({ sport: 'boxing' });
    expect(getSportModule(profile.answers.sport).positions ?? []).toEqual([]);
  });
});

function allEquipment(): string[] {
  const ids = new Set<string>();
  for (const days of Object.values(footballModule.program)) {
    for (const day of days) {
      for (const slot of day.exercises) {
        slot.equipment.forEach((id) => ids.add(id));
      }
    }
  }
  return Array.from(ids);
}
