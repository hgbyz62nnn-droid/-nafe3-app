import type { SportModuleData, WorkoutDayTemplate } from '../../engine/types';

/**
 * Fallback general-fitness program used for any sport that doesn't yet
 * have its own authored module (see registry.ts). Still fully static/
 * deterministic — just sport-agnostic rather than sport-specific.
 */

function fullBodyDay(id: string, name: string, intensity: WorkoutDayTemplate['intensity']): WorkoutDayTemplate {
  return {
    id,
    name,
    focus: 'General Fitness',
    intensity,
    durationMin: 40,
    exercises: [
      { name: 'Warm Up', sets: 1, reps: '8 min', equipment: [], category: 'warmup' },
      {
        name: 'Goblet Squat',
        sets: 3,
        reps: '10',
        equipment: ['dumbbells', 'kettlebell'],
        bodyweightAlternative: { name: 'Bodyweight Squat', reps: '15' },
        category: 'strength',
      },
      {
        name: 'Push-Ups',
        sets: 3,
        reps: '10',
        restSec: 60,
        equipment: [],
        category: 'strength',
      },
      {
        name: 'Dumbbell Row',
        sets: 3,
        reps: '10 / side',
        restSec: 60,
        equipment: ['dumbbells'],
        bodyweightAlternative: { name: 'Inverted Row (table)', reps: '8' },
        category: 'strength',
      },
      {
        name: 'Plank',
        sets: 3,
        reps: '30 sec',
        restSec: 45,
        equipment: [],
        category: 'strength',
      },
      {
        name: 'Interval Cardio',
        sets: 5,
        reps: '30 sec',
        restSec: 60,
        equipment: ['treadmill', 'bike'],
        bodyweightAlternative: { name: 'Jumping Jacks', reps: '30 sec' },
        category: 'conditioning',
      },
      { name: 'Cool Down', sets: 1, reps: '5 min', equipment: [], category: 'cooldown' },
    ],
  };
}

export const genericModule: SportModuleData = {
  id: 'gym_fitness',
  program: {
    beginner: [
      fullBodyDay('generic_beg_a', 'Full Body A', 'Low'),
      fullBodyDay('generic_beg_b', 'Full Body B', 'Low'),
    ],
    intermediate: [
      fullBodyDay('generic_int_a', 'Full Body A', 'Medium'),
      fullBodyDay('generic_int_b', 'Full Body B', 'Medium'),
      fullBodyDay('generic_int_c', 'Full Body C', 'Medium'),
    ],
    advanced: [
      fullBodyDay('generic_adv_a', 'Full Body A', 'High'),
      fullBodyDay('generic_adv_b', 'Full Body B', 'High'),
      fullBodyDay('generic_adv_c', 'Full Body C', 'High'),
    ],
  },
  nutritionProfile: {
    proteinGPerKg: 1.8,
    carbBias: 'moderate',
  },
};
