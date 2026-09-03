import { parseLocalDateKey } from '../engine/dateUtils';
import { EQUIPMENT_OPTIONS } from '../assessment/equipment';
import { TRAINING_LOCATIONS } from '../assessment/trainingLocations';
import type { CompetitionEvent, CompetitionEventType, TravelContext } from './types';

/**
 * Validation for the Context domain (spec §29) — strict, accumulates every
 * violation rather than failing on the first, never allows NaN/Infinity/
 * negative values through. Mirrors the exact validator shape/contract
 * already established by domain/nutrition/validateFoodLibrary.ts and
 * domain/engine/validation.ts's sanitizers.
 */

export class ContextValidationError extends Error {
  constructor(violations: string[]) {
    super(`Invalid context data:\n${violations.map((v) => `- ${v}`).join('\n')}`);
    this.name = 'ContextValidationError';
  }
}

const KNOWN_EQUIPMENT_IDS = new Set(EQUIPMENT_OPTIONS.map((e) => e.id));
const KNOWN_LOCATION_IDS = new Set(TRAINING_LOCATIONS.map((l) => l.id));
const COMPETITION_EVENT_TYPES: CompetitionEventType[] = ['match', 'race', 'tournament', 'event'];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidDateKey(value: unknown): value is string {
  return typeof value === 'string' && parseLocalDateKey(value) !== null;
}

function pushInvalidIds(violations: string[], label: string, ids: unknown, known: Set<string>) {
  if (!Array.isArray(ids)) {
    violations.push(`${label}: must be an array`);
    return;
  }
  for (const id of ids) {
    if (typeof id !== 'string' || !known.has(id)) {
      violations.push(`${label}: unknown id "${String(id)}"`);
    }
  }
}

export function validateTravelContext(travel: TravelContext): string[] {
  const violations: string[] = [];

  if (!isValidDateKey(travel.startDate)) violations.push(`startDate: invalid date "${travel.startDate}"`);
  if (!isValidDateKey(travel.endDate)) violations.push(`endDate: invalid date "${travel.endDate}"`);
  if (isValidDateKey(travel.startDate) && isValidDateKey(travel.endDate) && travel.endDate < travel.startDate) {
    violations.push('endDate must be on or after startDate');
  }

  const c = travel.constraints;
  if (!c || typeof c !== 'object') {
    violations.push('constraints: missing');
    return violations;
  }

  pushInvalidIds(violations, 'constraints.equipmentIds', c.equipmentIds, KNOWN_EQUIPMENT_IDS);
  pushInvalidIds(violations, 'constraints.locationIds', c.locationIds, KNOWN_LOCATION_IDS);

  const minutes = c.time?.minutesAvailable;
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    violations.push(`constraints.time.minutesAvailable: invalid value (${JSON.stringify(minutes)})`);
  }

  if (c.daysAvailablePerWeek !== undefined) {
    const d = c.daysAvailablePerWeek;
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 0 || d > 7) {
      violations.push(`constraints.daysAvailablePerWeek: invalid value (${JSON.stringify(d)})`);
    }
  }

  if (typeof c.affectsNutrition !== 'boolean') {
    violations.push('constraints.affectsNutrition: must be a boolean');
  }

  return violations;
}

export function validateCompetitionEvent(event: CompetitionEvent): string[] {
  const violations: string[] = [];

  if (!isValidDateKey(event.eventDate)) violations.push(`eventDate: invalid date "${event.eventDate}"`);
  if (event.eventTime !== undefined && !TIME_PATTERN.test(event.eventTime)) {
    violations.push(`eventTime: invalid time "${event.eventTime}" (expected HH:MM)`);
  }
  if (!COMPETITION_EVENT_TYPES.includes(event.eventType)) {
    violations.push(`eventType: invalid value "${event.eventType}"`);
  }
  for (const [label, value] of [
    ['preparationWindowDays', event.preparationWindowDays],
    ['recoveryWindowDays', event.recoveryWindowDays],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      violations.push(`${label}: invalid value (${JSON.stringify(value)})`);
    }
  }

  return violations;
}

export function assertValidTravelContext(travel: TravelContext): void {
  const violations = validateTravelContext(travel);
  if (violations.length > 0) throw new ContextValidationError(violations);
}

export function assertValidCompetitionEvent(event: CompetitionEvent): void {
  const violations = validateCompetitionEvent(event);
  if (violations.length > 0) throw new ContextValidationError(violations);
}

/** Rejects overlapping travel windows and same-day competition events (spec
 * §14/§29: "no conflicting active context" — validate and reject rather than
 * silently choosing one). Travel-vs-competition overlap is NOT rejected here:
 * resolveActiveContext.ts already gives competition deterministic precedence
 * over an overlapping travel window, so it's a supported combination. */
export function findConflictingContext(
  candidate: TravelContext | CompetitionEvent,
  existingTravel: TravelContext[],
  existingCompetition: CompetitionEvent[]
): string | null {
  if (candidate.mode === 'travel') {
    const overlap = existingTravel.find(
      (t) => t.id !== candidate.id && candidate.startDate <= t.endDate && candidate.endDate >= t.startDate
    );
    if (overlap) return `overlaps existing travel context ${overlap.id} (${overlap.startDate}..${overlap.endDate})`;
  } else {
    const sameDay = existingCompetition.find((e) => e.id !== candidate.id && e.eventDate === candidate.eventDate);
    if (sameDay) return `another competition event (${sameDay.id}) is already set for ${sameDay.eventDate}`;
  }
  return null;
}
