/**
 * Sport module registry. Each entry is intentionally minimal for now
 * (selection screen needs) — assessment questions, training rules,
 * nutrition considerations, exercise mappings etc. attach here per
 * sport as those systems get built, without touching this list's shape
 * for existing sports. Not hardcoded around football: every sport is a
 * uniform entry, football is just first in reference order.
 */
export type SportId =
  | 'football'
  | 'basketball'
  | 'swimming'
  | 'boxing'
  | 'tennis'
  | 'running'
  | 'gym_fitness'
  | 'volleyball'
  | 'athletics'
  | 'martial_arts';

export interface SportModule {
  id: SportId;
  name: string;
  photoAssetLabel: string;
}

export const SPORTS: SportModule[] = [
  { id: 'football', name: 'Football', photoAssetLabel: 'Football' },
  { id: 'basketball', name: 'Basketball', photoAssetLabel: 'Basketball' },
  { id: 'swimming', name: 'Swimming', photoAssetLabel: 'Swimming' },
  { id: 'boxing', name: 'Boxing', photoAssetLabel: 'Boxing' },
  { id: 'tennis', name: 'Tennis', photoAssetLabel: 'Tennis' },
  { id: 'running', name: 'Running', photoAssetLabel: 'Running' },
  { id: 'gym_fitness', name: 'Gym / Fitness', photoAssetLabel: 'Gym/Fitness' },
  { id: 'volleyball', name: 'Volleyball', photoAssetLabel: 'Volleyball' },
  { id: 'athletics', name: 'Athletics', photoAssetLabel: 'Athletics' },
  { id: 'martial_arts', name: 'Martial Arts', photoAssetLabel: 'Martial Arts' },
];
