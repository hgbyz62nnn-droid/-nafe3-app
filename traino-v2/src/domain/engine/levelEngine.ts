import type { AssessmentAnswers, FitnessLevel } from './types';

/**
 * Deterministic level classification. A fixed point-threshold table over
 * two static assessment inputs — no learned model, no external call.
 * Both inputs come straight from the assessment questionnaire, so the
 * result is reproducible for the same answers every time.
 */
export function determineLevel(answers: AssessmentAnswers): FitnessLevel {
  let score = 0;

  if (answers.experienceYears >= 3) score += 2;
  else if (answers.experienceYears >= 1) score += 1;

  if (answers.currentTrainingFrequency >= 5) score += 2;
  else if (answers.currentTrainingFrequency >= 3) score += 1;

  if (score >= 3) return 'advanced';
  if (score >= 1) return 'intermediate';
  return 'beginner';
}
