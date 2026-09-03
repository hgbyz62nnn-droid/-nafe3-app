import type { ExerciseDefinition } from './types';

/**
 * Hand-curated metadata for the exercises central enough to be worth
 * authoring precisely — general, well-established technique knowledge only
 * (never a clinical/medical claim). Every other exercise used by a sport
 * module still gets a full, valid `ExerciseDefinition` from generic
 * classification (see deriveDefinitions.ts) with honestly empty
 * muscle/cue/instruction fields rather than fabricated specifics — this
 * overlay is additive precision, not a requirement for validity.
 *
 * Keyed by the exercise's slugified id. An entry may:
 *   (a) refine an exercise that's already derived from a sport module (only
 *       the fields listed here are overridden — everything else keeps its
 *       derived value), or
 *   (b) introduce a standalone regression/progression rung that isn't
 *       authored in any sport module at all (must set `canonicalName`, which
 *       is how deriveDefinitions.ts recognizes it needs to build the whole
 *       entry from this overlay rather than merge onto a derived base).
 */
export const CURATED_OVERLAY: Record<string, Partial<ExerciseDefinition>> = {
  'back-squat': {
    aliases: ['Barbell Back Squat', 'Barbell Squat'],
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['core', 'hamstrings'],
    coachingCues: ['Brace your core before unracking', 'Track knees over toes', 'Drive through the whole foot'],
    commonMistakes: ['Knees caving inward', 'Losing a neutral spine at the bottom', 'Rising hips before chest'],
    instructions: [
      'Set the bar on your upper back, feet shoulder-width apart.',
      'Break at the hips and knees together, descending under control.',
      'Reach parallel or just below, then drive back up through your heels.',
    ],
    regressionIds: ['goblet-squat'],
  },
  'front-squat': {
    primaryMuscles: ['quads', 'core'],
    secondaryMuscles: ['glutes', 'upper_back'],
  },
  'goblet-squat': {
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['core'],
    progressionIds: ['back-squat'],
  },
  'bulgarian-split-squat': {
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings'],
    coachingCues: ['Keep most of your weight on the front foot', 'Stay tall through the torso'],
    regressionIds: ['walking-lunges'],
  },
  'walking-lunges': {
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings'],
    progressionIds: ['bulgarian-split-squat'],
  },
  'step-ups': {
    primaryMuscles: ['quads', 'glutes'],
  },
  'leg-press': {
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings'],
  },
  'romanian-deadlift': {
    primaryMuscles: ['hamstrings', 'glutes'],
    secondaryMuscles: ['lower_back'],
    coachingCues: ['Push hips back, not down', 'Keep the bar close to your legs', 'Stop when you feel a hamstring stretch'],
    commonMistakes: ['Rounding the lower back', 'Bending the knees too much (turns it into a squat)'],
    instructions: [
      'Hold the bar/dumbbells in front of your thighs.',
      'Hinge at the hips, sending them backward while keeping a flat back.',
      'Lower until you feel a stretch in your hamstrings, then drive hips forward to stand.',
    ],
    regressionIds: ['single-leg-glute-bridge'],
  },
  'good-morning': {
    primaryMuscles: ['hamstrings', 'lower_back'],
    secondaryMuscles: ['glutes'],
  },
  'single-leg-glute-bridge': {
    primaryMuscles: ['glutes', 'hamstrings'],
    progressionIds: ['romanian-deadlift'],
  },
  'bench-press': {
    aliases: ['Barbell Bench Press', 'Flat Bench Press'],
    primaryMuscles: ['chest', 'triceps'],
    secondaryMuscles: ['shoulders'],
    coachingCues: ['Retract shoulder blades before unracking', 'Keep feet planted', 'Control the bar to your chest'],
    commonMistakes: ['Bouncing the bar off the chest', 'Flaring elbows to 90 degrees'],
    instructions: [
      'Lie back with eyes under the bar, feet flat on the floor.',
      'Lower the bar to your mid-chest under control.',
      'Press back up to full elbow extension.',
    ],
    regressionIds: ['push-ups'],
  },
  'dumbbell-floor-press': {
    primaryMuscles: ['chest', 'triceps'],
  },
  'dumbbell-bench-press': {
    aliases: ['DB Bench Press'],
    primaryMuscles: ['chest', 'triceps'],
    secondaryMuscles: ['shoulders'],
  },
  'push-ups': {
    aliases: ['Pushups', 'Press-Ups'],
    primaryMuscles: ['chest', 'triceps'],
    secondaryMuscles: ['core', 'shoulders'],
    coachingCues: ['Keep a straight line from head to heels', "Don't let hips sag", 'Full range: chest close to the floor'],
    commonMistakes: ['Flaring elbows too wide', 'Sagging hips', 'Partial range of motion'],
    instructions: ['Start in a high plank, hands under shoulders.', 'Lower your chest toward the floor with elbows at ~45 degrees.', 'Push back up to full extension.'],
    regressionIds: ['incline-push-ups'],
    progressionIds: ['feet-elevated-push-up'],
  },
  'incline-push-ups': {
    primaryMuscles: ['chest', 'triceps'],
    progressionIds: ['push-ups'],
  },
  'feet-elevated-push-up': {
    canonicalName: 'Feet-Elevated Push-Up',
    category: 'strength',
    equipment: [],
    difficulty: 'intermediate',
    primaryMuscles: ['chest', 'shoulders'],
    secondaryMuscles: ['triceps', 'core'],
    coachingCues: ['Elevate feet on a bench or step', 'Keep the same straight-line plank position'],
    regressionIds: ['push-ups'],
    progressionIds: ['weighted-push-up'],
  },
  'weighted-push-up': {
    canonicalName: 'Weighted Push-Up',
    category: 'strength',
    equipment: ['other'],
    difficulty: 'advanced',
    primaryMuscles: ['chest', 'triceps'],
    secondaryMuscles: ['core', 'shoulders'],
    coachingCues: ['Add light resistance (plate/vest) on the upper back', 'Keep full range of motion — do not shorten reps to compensate'],
    regressionIds: ['feet-elevated-push-up'],
  },
  'pull-up': {
    aliases: ['Pullup', 'Pull Up'],
    primaryMuscles: ['lats', 'biceps'],
    secondaryMuscles: ['upper_back', 'forearms'],
    coachingCues: ['Start from a full dead hang', 'Pull elbows down and back', 'Avoid excessive kipping'],
    commonMistakes: ['Partial range of motion', 'Using momentum instead of control'],
    instructions: ['Hang from the bar with an overhand grip.', 'Pull your chin above the bar, driving elbows down.', 'Lower back to a full hang under control.'],
    regressionIds: ['band-assisted-pull-up'],
    progressionIds: ['weighted-pull-up'],
  },
  'weighted-pull-up': {
    primaryMuscles: ['lats', 'biceps'],
    secondaryMuscles: ['upper_back'],
    regressionIds: ['pull-up'],
  },
  'band-assisted-pull-up': {
    canonicalName: 'Band-Assisted Pull-Up',
    category: 'strength',
    equipment: ['pull_up_bar', 'resistance_bands'],
    difficulty: 'beginner',
    primaryMuscles: ['lats', 'biceps'],
    secondaryMuscles: ['upper_back'],
    coachingCues: ['Loop a band around the bar, foot or knee in the band', 'Control the descent — do not just drop'],
    regressionIds: ['inverted-row'],
    progressionIds: ['pull-up'],
  },
  'inverted-row': {
    canonicalName: 'Inverted Row',
    category: 'strength',
    equipment: ['pull_up_bar'],
    difficulty: 'beginner',
    primaryMuscles: ['upper_back', 'lats'],
    secondaryMuscles: ['biceps', 'core'],
    coachingCues: ['Set the bar to a height where your body is at an angle you can control', 'Squeeze shoulder blades together at the top'],
    progressionIds: ['band-assisted-pull-up'],
  },
  'dumbbell-row': {
    primaryMuscles: ['upper_back', 'lats'],
    secondaryMuscles: ['biceps'],
    coachingCues: ['Keep a flat back', 'Pull elbow toward your hip, not straight up'],
  },
  'lat-pulldown': {
    primaryMuscles: ['lats', 'upper_back'],
    secondaryMuscles: ['biceps'],
  },
  plank: {
    primaryMuscles: ['core'],
    secondaryMuscles: ['shoulders', 'glutes'],
    coachingCues: ['Squeeze glutes and brace the core', 'Keep hips level — no sagging or piking'],
    commonMistakes: ['Hips too high (piking)', 'Hips sagging toward the floor'],
    instructions: ['Support your weight on forearms and toes.', 'Keep a straight line from head to heels.', 'Hold, breathing normally, without letting hips drift.'],
    regressionIds: ['dead-bug'],
  },
  'side-plank': {
    primaryMuscles: ['obliques', 'core'],
  },
  'dead-bug': {
    primaryMuscles: ['core'],
    progressionIds: ['plank'],
  },
  'box-jump': {
    primaryMuscles: ['quads', 'glutes'],
    coachingCues: ['Land softly with bent knees', 'Stand fully upright on the box before stepping down'],
    commonMistakes: ['Jumping onto a box too high to land safely', 'Stepping down carelessly'],
    regressionIds: ['broad-jump'],
  },
  'broad-jump': {
    primaryMuscles: ['quads', 'glutes'],
    progressionIds: ['box-jump'],
  },
  'sprint-intervals': {
    coachingCues: ['Gradually build to top speed rather than jumping straight to max effort', 'Use the full recovery between reps'],
    regressionIds: ['bike-intervals'],
  },
  'bike-intervals': {
    progressionIds: ['sprint-intervals'],
  },
  'shuttle-runs': {},
  'continuous-freestyle-swim': {
    coachingCues: ['Keep a long, relaxed stroke', 'Exhale steadily underwater'],
    regressionIds: ['pull-buoy-freestyle'],
  },
  'pull-buoy-freestyle': {
    coachingCues: ['Focus the effort on your upper-body pull with the buoy supporting your legs'],
    progressionIds: ['continuous-freestyle-swim'],
  },
  'freestyle-catch-up-drill': {
    coachingCues: ['Let the leading hand fully extend before the other hand starts its stroke', 'Keeps stroke timing controlled and technique-focused'],
  },
};
