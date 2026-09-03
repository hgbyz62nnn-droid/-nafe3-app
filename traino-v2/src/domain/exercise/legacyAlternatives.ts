/**
 * The pre-Exercise-Intelligence alternatives table — moved here verbatim as
 * the single source of truth (no data change), so both the new library
 * derivation (deriveDefinitions.ts) and the old public API
 * (engine/exerciseAlternatives.ts, kept as a thin re-export for existing
 * callers) read the exact same table instead of maintaining two copies.
 */
export interface LegacyAlternativeExercise {
  name: string;
  reps: string;
}

export const LEGACY_ALTERNATIVES_BY_NAME: Record<string, LegacyAlternativeExercise[]> = {
  'Back Squat': [
    { name: 'Front Squat', reps: '6' },
    { name: 'Bulgarian Split Squat', reps: '10 / leg' },
  ],
  'Romanian Deadlift': [
    { name: 'Single-Leg Glute Bridge', reps: '12 / leg' },
    { name: 'Good Morning', reps: '10' },
  ],
  'Bulgarian Split Squat': [
    { name: 'Walking Lunges', reps: '12 / leg' },
    { name: 'Step-Ups', reps: '10 / leg' },
  ],
  'Leg Press': [
    { name: 'Walking Lunges', reps: '12 / leg' },
    { name: 'Goblet Squat', reps: '12' },
  ],
  'Bench Press': [
    { name: 'Push-Ups', reps: '15' },
    { name: 'Dumbbell Floor Press', reps: '10' },
  ],
  'Pull-Up': [
    { name: 'Dumbbell Row', reps: '10 / side' },
    { name: 'Lat Pulldown', reps: '10' },
  ],
  'Weighted Pull-Up': [
    { name: 'Pull-Up', reps: '8-10' },
    { name: 'Dumbbell Row', reps: '12 / side' },
  ],
  'Sprint Intervals': [
    { name: 'Bike Intervals', reps: '20 sec' },
    { name: 'Shuttle Runs', reps: '20 sec' },
  ],
  'Box Jump': [
    { name: 'Broad Jump', reps: '6' },
    { name: 'Step-Up with Drive', reps: '8 / leg' },
  ],
  'Push-Ups': [
    { name: 'Incline Push-Ups', reps: '15' },
    { name: 'Dumbbell Bench Press', reps: '10' },
  ],
  Plank: [
    { name: 'Dead Bug', reps: '10 / side' },
    { name: 'Side Plank', reps: '30 sec / side' },
  ],

  // -- Swimming --
  'Freestyle Catch-Up Drill': [
    { name: 'Freestyle Sculling Drill', reps: '25m' },
    { name: 'Single-Arm Freestyle Drill', reps: '25m / arm' },
  ],
  'Kickboard Flutter Kick': [
    { name: 'Fins Flutter Kick Sprint', reps: '25m' },
    { name: 'Vertical Kicking (no board)', reps: '30 sec' },
  ],
  'Sprint Intervals 50m': [
    { name: 'Sprint Intervals 100m', reps: '100m @ 1:40' },
    { name: 'Descending 100s', reps: '100m descending pace' },
  ],
  'Continuous Freestyle Swim': [
    { name: 'Pull Buoy Freestyle', reps: '50m' },
    { name: 'Descending 100s', reps: '100m descending pace' },
  ],
  'Pull Buoy Freestyle': [
    { name: 'Pull Buoy + Paddles Freestyle', reps: '75m' },
    { name: 'Continuous Freestyle Swim', reps: '200m easy pace' },
  ],
};
