import type { MatchReasonCode } from './types';

/**
 * Shared display-text helpers for Exercise Intelligence data — one place so
 * the Exercise Detail UI and the AI Coach's exercise-intelligence replies
 * (see aiCoachEngine.ts) render the exact same fixed vocabulary instead of
 * duplicating it.
 */

export function formatEnumLabel(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** The concise reason chips shown next to a ranked replacement candidate
 * (spec §19: "Same movement pattern", "Matches today's goal", ...). */
export const MATCH_REASON_LABELS: Record<MatchReasonCode, string> = {
  same_movement_pattern: 'Same movement pattern',
  same_training_intent: "Matches today's goal",
  muscle_overlap: 'Targets the same muscles',
  no_equipment_required: 'No equipment required',
  equipment_available: 'Uses equipment you have',
  matches_athlete_level: 'Matches your level',
  sport_relevant: 'Relevant to your sport',
  progression_compatible: 'Same progression style',
  previously_preferred: "You've liked this before",
  frequently_completed: 'You complete this often',
};
