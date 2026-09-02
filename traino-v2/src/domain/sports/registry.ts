import type { SportId } from './sports';
import type { SportModuleData } from '../engine/types';
import { footballModule } from './football/program';
import { genericModule } from './generic/program';

/**
 * Sport module registry. Only football is fully authored so far (the
 * pilot for the Deterministic Coaching Engine); every other sport falls
 * back to the generic full-body program until it gets its own module —
 * still 100% static/rule-based, just not sport-specific yet.
 */
const REGISTRY: Partial<Record<SportId, SportModuleData>> = {
  football: footballModule,
};

export function getSportModule(sportId: SportId): SportModuleData {
  return REGISTRY[sportId] ?? { ...genericModule, id: sportId };
}
