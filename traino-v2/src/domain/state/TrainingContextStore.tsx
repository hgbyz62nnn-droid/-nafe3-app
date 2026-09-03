import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadVersioned, saveVersioned } from './persistence';
import { addDays, localDateKey, parseLocalDateKey } from '../engine/dateUtils';
import { resolveActiveContext } from '../context/resolveActiveContext';
import { assertValidCompetitionEvent, assertValidTravelContext, findConflictingContext } from '../context/validation';
import type { CompetitionEvent, ResolvedContext, TravelContext } from '../context/types';

/**
 * Persisted store for Travel Mode / Competition Mode contexts (spec §28) —
 * the exact same versioned load/save infrastructure every other persisted
 * store in this app already uses (`domain/state/persistence.ts`).
 *
 * Distinction that matters for "never overwrite history" (spec §13/§28):
 * these records are the athlete's own editable PLAN CONFIGURATION (like a
 * profile setting), so they can be created/edited/cancelled freely. What
 * must never be silently rewritten is LOGGED HISTORY — a completed
 * workout's `contextMode`/`originalExerciseName` (see LogContext.tsx) is
 * untouched even if the TravelContext/CompetitionEvent record referenced
 * by that log is later edited or removed. A brand-new athlete with no
 * context data at all continues working exactly as before (empty stores,
 * `resolveActiveContext` always returns `mode: 'normal'`).
 */

const STORAGE_KEY = 'traino.trainingContext';
const DATA_VERSION = 1;

interface Store {
  travel: Record<string, TravelContext>;
  competition: Record<string, CompetitionEvent>;
}

function emptyStore(): Store {
  return { travel: {}, competition: {} };
}

function isTravelContext(value: unknown): value is TravelContext {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.mode === 'travel' &&
    typeof v.startDate === 'string' &&
    typeof v.endDate === 'string' &&
    typeof v.constraints === 'object' &&
    v.constraints !== null &&
    typeof v.createdAt === 'string'
  );
}

function isCompetitionEvent(value: unknown): value is CompetitionEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && v.mode === 'competition' && typeof v.eventDate === 'string' && typeof v.eventType === 'string';
}

function isStore(value: unknown): value is Store {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.travel !== 'object' || v.travel === null) return false;
  if (typeof v.competition !== 'object' || v.competition === null) return false;
  return (
    Object.values(v.travel as Record<string, unknown>).every(isTravelContext) &&
    Object.values(v.competition as Record<string, unknown>).every(isCompetitionEvent)
  );
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface TrainingContextValue {
  travelContexts: TravelContext[];
  competitionEvents: CompetitionEvent[];
  /** Deterministic resolution for one date — see resolveActiveContext.ts. */
  getResolvedContext: (date: string) => ResolvedContext;
  /** Throws ContextValidationError on invalid input or a rejected conflict
   * (spec §14/§29) — callers (UI) should catch and surface the message. */
  addTravelContext: (input: Omit<TravelContext, 'id' | 'mode' | 'createdAt'>) => TravelContext;
  addCompetitionEvent: (input: Omit<CompetitionEvent, 'id' | 'mode' | 'createdAt'>) => CompetitionEvent;
  /** Ends a travel window early: if it hasn't started yet, removes it outright
   * (nothing happened, nothing to audit); if active, shortens `endDate` to
   * today. Never extends or un-shortens a window. */
  cancelTravelContext: (id: string, today?: string) => void;
  removeCompetitionEvent: (id: string) => void;
}

const TrainingContextCtx = createContext<TrainingContextValue | null>(null);

export function TrainingContextProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => {
    const result = loadVersioned<Store>({
      storageKey: STORAGE_KEY,
      currentVersion: DATA_VERSION,
      migrations: [],
      validate: isStore,
      fallback: emptyStore,
    });
    return result.data;
  });

  // Storage updates use the FUNCTIONAL setState form (`setStore(prev => ...)`),
  // never spreading the outer `store` closure directly — two mutators called
  // in the same render tick would otherwise each spread a stale outer `store`,
  // silently discarding whichever update happened first. Conflict validation
  // (which must reject synchronously, before the caller ever sees a resolved
  // promise) reads the render-scoped `travelContexts`/`competitionEvents`
  // below instead: React does not guarantee a state updater function runs
  // synchronously when `setState` is called, so a rejection decided inside
  // one can't reliably be thrown back out to the caller.
  const travelContexts = useMemo(() => Object.values(store.travel), [store.travel]);
  const competitionEvents = useMemo(() => Object.values(store.competition), [store.competition]);

  function getResolvedContext(date: string): ResolvedContext {
    return resolveActiveContext(date, travelContexts, competitionEvents);
  }

  function addTravelContext(input: Omit<TravelContext, 'id' | 'mode' | 'createdAt'>): TravelContext {
    const travel: TravelContext = { ...input, id: genId('travel'), mode: 'travel', createdAt: new Date().toISOString() };
    assertValidTravelContext(travel);
    const conflict = findConflictingContext(travel, travelContexts, competitionEvents);
    if (conflict) throw new Error(`Cannot start Travel Mode: ${conflict}`);
    setStore((prev) => {
      const next = { ...prev, travel: { ...prev.travel, [travel.id]: travel } };
      saveVersioned(STORAGE_KEY, DATA_VERSION, next);
      return next;
    });
    return travel;
  }

  function addCompetitionEvent(input: Omit<CompetitionEvent, 'id' | 'mode' | 'createdAt'>): CompetitionEvent {
    const event: CompetitionEvent = { ...input, id: genId('event'), mode: 'competition', createdAt: new Date().toISOString() };
    assertValidCompetitionEvent(event);
    const conflict = findConflictingContext(event, travelContexts, competitionEvents);
    if (conflict) throw new Error(`Cannot add competition event: ${conflict}`);
    setStore((prev) => {
      const next = { ...prev, competition: { ...prev.competition, [event.id]: event } };
      saveVersioned(STORAGE_KEY, DATA_VERSION, next);
      return next;
    });
    return event;
  }

  function cancelTravelContext(id: string, today: string = localDateKey(new Date())) {
    setStore((prev) => {
      const existing = prev.travel[id];
      if (!existing) return prev;
      let next: Store;
      if (today <= existing.startDate) {
        // Not yet started, or starting today: ending it now means it never
        // takes effect for resolution purposes — nothing to audit, and
        // capping endDate to "yesterday" would produce an invalid
        // (endDate < startDate) range. Remove outright. Any log entries
        // already recorded today are untouched (logs are decoupled from
        // this plan-config record — see file header).
        const { [id]: _removed, ...rest } = prev.travel;
        next = { ...prev, travel: rest };
      } else if (today <= existing.endDate) {
        // Already ongoing: cap endDate to yesterday so today (and onward)
        // resolves as normal immediately, without rewriting the days that
        // already happened under this context.
        const yesterday = localDateKey(addDays(parseLocalDateKey(today)!, -1));
        next = { ...prev, travel: { ...prev.travel, [id]: { ...existing, endDate: yesterday } } };
      } else {
        return prev;
      }
      saveVersioned(STORAGE_KEY, DATA_VERSION, next);
      return next;
    });
  }

  function removeCompetitionEvent(id: string) {
    setStore((prev) => {
      if (!prev.competition[id]) return prev;
      const { [id]: _removed, ...rest } = prev.competition;
      const next = { ...prev, competition: rest };
      saveVersioned(STORAGE_KEY, DATA_VERSION, next);
      return next;
    });
  }

  const value = useMemo<TrainingContextValue>(
    () => ({
      travelContexts,
      competitionEvents,
      getResolvedContext,
      addTravelContext,
      addCompetitionEvent,
      cancelTravelContext,
      removeCompetitionEvent,
    }),
    [store, travelContexts, competitionEvents]
  );

  return <TrainingContextCtx.Provider value={value}>{children}</TrainingContextCtx.Provider>;
}

export function useTrainingContext(): TrainingContextValue {
  const ctx = useContext(TrainingContextCtx);
  if (!ctx) throw new Error('useTrainingContext must be used within a TrainingContextProvider');
  return ctx;
}
