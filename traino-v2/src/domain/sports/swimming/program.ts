import type { SportModuleData, WorkoutDayTemplate } from '../../engine/types';

/**
 * Swimming — second Sport Module, and the architecture's extensibility test.
 * Deliberately NOT a copy of football's structure: a swim session is built
 * from distance/interval/rest sets rather than exercise-and-load sets, but
 * that entire vocabulary fits inside the existing `ExerciseSlot` shape —
 * `reps` is free-text ("8 x 50m @ 1:00"), `restSec` covers interval rest,
 * and `sets` covers repeat count — so no engine change was needed to
 * represent it, only data.
 *
 * Two deliberate design choices, both to satisfy the existing Sport Module
 * contract (see validateSportModule.ts) rather than inventing new rules:
 *
 * 1. Warm-up/cool-down are always dryland (no `equipment`, no `locations`),
 *    so they can never be substitution-blocked and dropped — a session
 *    should never start or end with nothing, regardless of pool access.
 * 2. Every main-set slot that needs the pool and/or equipment carries a
 *    genuinely swim-appropriate `bodyweightAlternative` — a dryland drill
 *    that trains the same quality (kick -> flutter kicks, pull -> band
 *    rows, sprint -> high-knee sprints) — for an athlete without pool
 *    access, exactly the pattern already proven by football's equipment/
 *    location substitution.
 *
 * Injury coverage: shoulder (rotator-cuff strain from stroke volume) and
 * knee (breaststroke kick) are the swim-relevant contraindications used
 * here; lower_back covers starts/dryland extension work. No stroke-
 * preference question was added to the assessment — the three day types
 * below (technique/sprint, dryland strength, endurance) already rotate
 * through freestyle, breaststroke and backstroke work across the week
 * without needing the athlete to pre-select one, the same way football's
 * day rotation doesn't ask which position the athlete plays.
 */

function drylandWarmup(minutes: string): WorkoutDayTemplate['exercises'][number] {
  return { name: 'Dryland Warm-Up (joint circles + light jog)', sets: 1, reps: minutes, equipment: [], category: 'warmup' };
}

function drylandCooldown(minutes: string): WorkoutDayTemplate['exercises'][number] {
  return { name: 'Cool-Down Stretch (shoulders, hips, calves)', sets: 1, reps: minutes, equipment: [], category: 'cooldown' };
}

const beginnerDays: WorkoutDayTemplate[] = [
  {
    id: 'swim_beg_technique',
    statCategory: 'speed',
    name: 'Technique & Sprint Basics',
    focus: 'Swimming Performance',
    intensity: 'Low',
    durationMin: 35,
    exercises: [
      drylandWarmup('5 min'),
      {
        name: 'Freestyle Catch-Up Drill',
        sets: 4,
        reps: '25m',
        restSec: 20,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Prone Swim Motion (floor)', reps: '20 reps' },
        category: 'technique',
        contraindications: ['shoulder'],
      },
      {
        name: 'Kickboard Flutter Kick',
        sets: 4,
        reps: '25m',
        restSec: 20,
        equipment: ['kickboard'],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Flutter Kicks (floor)', reps: '20 / leg' },
        category: 'technique',
        contraindications: ['knee'],
      },
      {
        name: 'Easy Sprint 25s',
        sets: 6,
        reps: '25m easy pace',
        restSec: 30,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'High-Knee Sprint Drill', reps: '20 sec' },
        category: 'conditioning',
      },
      drylandCooldown('5 min'),
    ],
  },
  {
    id: 'swim_beg_dryland',
    statCategory: 'strength',
    name: 'Dryland Strength & Core',
    focus: 'Swimming Performance',
    intensity: 'Low',
    durationMin: 30,
    exercises: [
      drylandWarmup('5 min'),
      { name: 'Push-Ups', sets: 3, reps: '8', restSec: 45, equipment: [], category: 'strength' },
      {
        name: 'Resistance Band Pull-Through',
        sets: 3,
        reps: '12',
        restSec: 45,
        equipment: ['resistance_bands'],
        bodyweightAlternative: { name: 'Bodyweight Pull-Through Motion', reps: '15' },
        category: 'strength',
        contraindications: ['shoulder'],
      },
      { name: 'Plank', sets: 3, reps: '30 sec', restSec: 30, equipment: [], category: 'strength' },
      {
        name: 'Superman Hold',
        sets: 3,
        reps: '20 sec',
        restSec: 30,
        equipment: [],
        bodyweightAlternative: { name: 'Bird-Dog', reps: '10 / side' },
        category: 'strength',
        contraindications: ['lower_back'],
      },
      drylandCooldown('5 min'),
    ],
  },
  {
    id: 'swim_beg_endurance',
    statCategory: 'stamina',
    name: 'Endurance Swim',
    focus: 'Swimming Performance',
    intensity: 'Medium',
    durationMin: 40,
    exercises: [
      drylandWarmup('5 min'),
      {
        name: 'Continuous Freestyle Swim',
        sets: 1,
        reps: '300m easy pace',
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Steady-State Jog', reps: '12 min' },
        category: 'conditioning',
      },
      {
        name: 'Pull Buoy Freestyle',
        sets: 4,
        reps: '50m',
        restSec: 30,
        equipment: ['pull_buoy'],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Seated Band Row', reps: '15' },
        category: 'conditioning',
        contraindications: ['shoulder'],
      },
      {
        name: 'Breaststroke Technique',
        sets: 4,
        reps: '25m',
        restSec: 30,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Frog Kick Drill (floor)', reps: '15' },
        category: 'technique',
        contraindications: ['knee'],
      },
      drylandCooldown('5 min'),
    ],
  },
];

const intermediateDays: WorkoutDayTemplate[] = [
  {
    id: 'swim_int_technique',
    statCategory: 'speed',
    name: 'Technique & Sprint',
    focus: 'Swimming Performance',
    intensity: 'Medium',
    durationMin: 45,
    exercises: [
      drylandWarmup('8 min'),
      {
        name: 'Freestyle Sculling Drill',
        sets: 4,
        reps: '50m',
        restSec: 25,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Prone Swim Motion (floor)', reps: '30 reps' },
        category: 'technique',
        contraindications: ['shoulder'],
      },
      {
        name: 'Fins Flutter Kick Sprint',
        sets: 6,
        reps: '25m',
        restSec: 25,
        equipment: ['fins'],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Flutter Kicks (floor)', reps: '30 / leg' },
        category: 'technique',
        contraindications: ['knee'],
      },
      {
        name: 'Sprint Intervals 50m',
        sets: 8,
        reps: '50m @ 1:00',
        restSec: 20,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'High-Knee Sprint Intervals', reps: '30 sec' },
        category: 'conditioning',
      },
      {
        name: 'Backstroke Technique',
        sets: 4,
        reps: '25m',
        restSec: 25,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Supine Arm Circles (floor)', reps: '20 / side' },
        category: 'technique',
        contraindications: ['shoulder'],
      },
      drylandCooldown('5 min'),
    ],
  },
  {
    id: 'swim_int_dryland',
    statCategory: 'strength',
    name: 'Dryland Strength & Core',
    focus: 'Swimming Performance',
    intensity: 'Medium',
    durationMin: 40,
    exercises: [
      drylandWarmup('8 min'),
      { name: 'Push-Ups', sets: 4, reps: '12', restSec: 45, equipment: [], category: 'strength' },
      {
        name: 'Dumbbell Row',
        sets: 3,
        reps: '10 / side',
        restSec: 60,
        equipment: ['dumbbells'],
        bodyweightAlternative: { name: 'Resistance Band Row', reps: '15 / side' },
        category: 'strength',
        contraindications: ['shoulder'],
      },
      {
        name: 'Medicine Ball Rotational Throw',
        sets: 3,
        reps: '10 / side',
        restSec: 60,
        equipment: ['medicine_ball'],
        bodyweightAlternative: { name: 'Standing Trunk Rotations', reps: '15 / side' },
        category: 'power',
        contraindications: ['lower_back'],
      },
      { name: 'Plank', sets: 3, reps: '45 sec', restSec: 30, equipment: [], category: 'strength' },
      {
        name: 'Superman Hold',
        sets: 3,
        reps: '30 sec',
        restSec: 30,
        equipment: [],
        bodyweightAlternative: { name: 'Bird-Dog', reps: '12 / side' },
        category: 'strength',
        contraindications: ['lower_back'],
      },
      drylandCooldown('5 min'),
    ],
  },
  {
    id: 'swim_int_endurance',
    statCategory: 'stamina',
    name: 'Endurance Swim',
    focus: 'Swimming Performance',
    intensity: 'High',
    durationMin: 50,
    exercises: [
      drylandWarmup('8 min'),
      {
        name: 'Continuous Freestyle Swim',
        sets: 1,
        reps: '600m steady pace',
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Steady-State Run', reps: '20 min' },
        category: 'conditioning',
      },
      {
        name: 'Pull Buoy + Paddles Freestyle',
        sets: 6,
        reps: '75m',
        restSec: 25,
        equipment: ['pull_buoy', 'paddles'],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Seated Band Row', reps: '20' },
        category: 'conditioning',
        contraindications: ['shoulder'],
      },
      {
        name: 'Butterfly Technique',
        sets: 4,
        reps: '25m',
        restSec: 30,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Standing Dolphin Kick Drill (dryland)', reps: '12' },
        category: 'technique',
        contraindications: ['shoulder', 'lower_back'],
      },
      {
        name: 'Descending 100s',
        sets: 4,
        reps: '100m descending pace',
        restSec: 30,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Interval Jog (descending pace)', reps: '4 min' },
        category: 'conditioning',
      },
      drylandCooldown('5 min'),
    ],
  },
];

const advancedDays: WorkoutDayTemplate[] = [
  {
    id: 'swim_adv_technique',
    statCategory: 'speed',
    name: 'Technique & Sprint',
    focus: 'Swimming Performance',
    intensity: 'High',
    durationMin: 55,
    exercises: [
      drylandWarmup('10 min'),
      {
        name: 'Fins Sprint 25s',
        sets: 8,
        reps: '25m max effort',
        restSec: 30,
        equipment: ['fins'],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Max-Effort Sprint Intervals', reps: '15 sec' },
        category: 'conditioning',
        highImpact: true,
      },
      {
        name: 'Racing Start & Turn Practice',
        sets: 6,
        reps: '15m',
        restSec: 40,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Broad Jump + Streamline Drill (dryland)', reps: '6' },
        category: 'power',
        highImpact: true,
        contraindications: ['lower_back', 'shoulder'],
      },
      {
        name: 'Sprint Intervals 100m',
        sets: 6,
        reps: '100m @ 1:40',
        restSec: 20,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'High-Intensity Interval Run', reps: '90 sec' },
        category: 'conditioning',
      },
      {
        name: 'Paddles Freestyle Power Set',
        sets: 5,
        reps: '50m @ 0:55',
        restSec: 25,
        equipment: ['paddles'],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Resistance Band Pull Sprint', reps: '20' },
        category: 'power',
        contraindications: ['shoulder'],
      },
      drylandCooldown('5 min'),
    ],
  },
  {
    id: 'swim_adv_dryland',
    statCategory: 'strength',
    name: 'Dryland Strength & Power',
    focus: 'Swimming Performance',
    intensity: 'Medium',
    durationMin: 45,
    exercises: [
      drylandWarmup('10 min'),
      {
        name: 'Weighted Pull-Up',
        sets: 4,
        reps: '6',
        restSec: 90,
        equipment: ['pull_up_bar'],
        bodyweightAlternative: { name: 'Pull-Up', reps: '8-10' },
        category: 'strength',
        contraindications: ['shoulder'],
      },
      { name: 'Push-Ups (weighted vest optional)', sets: 4, reps: '15', restSec: 60, equipment: [], category: 'strength' },
      {
        name: 'Cable Rotation',
        sets: 3,
        reps: '12 / side',
        restSec: 60,
        equipment: ['cable_machine'],
        bodyweightAlternative: { name: 'Standing Trunk Rotations', reps: '18 / side' },
        category: 'strength',
      },
      {
        name: 'Medicine Ball Rotational Throw',
        sets: 4,
        reps: '10 / side',
        restSec: 60,
        equipment: ['medicine_ball'],
        bodyweightAlternative: { name: 'Explosive Trunk Rotations', reps: '15 / side' },
        category: 'power',
        contraindications: ['lower_back'],
      },
      { name: 'Plank', sets: 3, reps: '60 sec', restSec: 30, equipment: [], category: 'strength' },
      drylandCooldown('5 min'),
    ],
  },
  {
    id: 'swim_adv_endurance',
    statCategory: 'stamina',
    name: 'Endurance & Race Pace',
    focus: 'Swimming Performance',
    intensity: 'High',
    durationMin: 60,
    exercises: [
      drylandWarmup('10 min'),
      {
        name: 'Continuous Freestyle Swim',
        sets: 1,
        reps: '1000m steady pace',
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Steady-State Run', reps: '30 min' },
        category: 'conditioning',
      },
      {
        name: 'Race-Pace 200s',
        sets: 5,
        reps: '200m @ race pace',
        restSec: 40,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Tempo Run Intervals', reps: '3 min' },
        category: 'conditioning',
      },
      {
        name: 'Pull Buoy + Paddles Freestyle',
        sets: 8,
        reps: '100m @ 1:30',
        restSec: 25,
        equipment: ['pull_buoy', 'paddles'],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Seated Band Row', reps: '25' },
        category: 'conditioning',
        contraindications: ['shoulder'],
      },
      {
        name: 'Individual Medley Technique (all 4 strokes)',
        sets: 4,
        reps: '50m',
        restSec: 30,
        equipment: [],
        locations: ['pool'],
        bodyweightAlternative: { name: 'Mixed Dryland Stroke Drills', reps: '8 / stroke' },
        category: 'technique',
        contraindications: ['shoulder', 'knee'],
      },
      drylandCooldown('5 min'),
    ],
  },
];

export const swimmingModule: SportModuleData = {
  id: 'swimming',
  program: {
    beginner: beginnerDays,
    intermediate: intermediateDays,
    advanced: advancedDays,
  },
  nutritionProfile: {
    // Endurance-dominant sport: meaningful but not football-level protein
    // demand, and a high carb bias to fuel long aerobic volume.
    proteinGPerKg: 1.6,
    carbBias: 'high',
  },
};
