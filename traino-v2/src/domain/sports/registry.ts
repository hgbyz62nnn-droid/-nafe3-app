import type { SportId } from './sports';
import type { SportModuleData } from '../engine/types';
import { footballModule } from './football/program';
import { genericModule } from './generic/program';
import { assertValidSportModule } from './validateSportModule';

/**
 * Sport module registry. Only football is fully authored so far (the
 * pilot for the Deterministic Coaching Engine); every other sport falls
 * back to the generic full-body program until it gets its own module —
 * still 100% static/rule-based, just not sport-specific yet.
 */
const REGISTRY: Partial<Record<SportId, SportModuleData>> = {
  football: footballModule,
};

// Fail fast: a module that doesn't satisfy the Sport Module contract (see
// validateSportModule.ts) throws here, at import time — during `tsc -b`,
// the test run, or the dev server starting — rather than ever reaching an
// athlete as a partially-valid plan at runtime.
assertValidSportModule(genericModule);
for (const module of Object.values(REGISTRY)) {
  assertValidSportModule(module);
}

export function getSportModule(sportId: SportId): SportModuleData {
  return REGISTRY[sportId] ?? { ...genericModule, id: sportId };
}
