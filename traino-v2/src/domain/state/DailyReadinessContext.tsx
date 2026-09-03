import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { DailyReadinessInputs, DailyReadinessRecord, ReadinessStatus } from '../readiness/types';
import { computeReadiness } from '../engine/readinessEngine';
import { sanitizeReadinessInputs } from '../engine/validation';
import { localDateKey } from '../engine/dateUtils';
import { loadVersioned, saveVersioned } from './persistence';

/**
 * Persisted store for the Daily Readiness System — one record per calendar
 * date, keyed by the local `YYYY-MM-DD` date string. Uses the exact same
 * versioned load/save infrastructure ProfileContext/LogContext/
 * WeeklyCoachingContext already use (`domain/state/persistence.ts`).
 *
 * Submitting a check-in for a date that already has a record REPLACES that
 * date's record entirely (an idempotent upsert, same pattern `LogContext`
 * already uses for weight/meal logging) — a same-day resubmission is safe,
 * and a new day always creates its own new record rather than mutating a
 * prior day's history.
 */

const STORAGE_KEY = 'traino.readiness';
const DATA_VERSION = 1;

type Store = Record<string, DailyReadinessRecord>;

const READINESS_STATUSES: ReadinessStatus[] = ['high', 'normal', 'reduced', 'recovery'];

function isReadinessInputs(value: unknown): value is DailyReadinessInputs {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sleepQuality === 'number' &&
    typeof v.sleepDurationBucket === 'number' &&
    typeof v.energy === 'number' &&
    typeof v.stress === 'number' &&
    typeof v.soreness === 'number' &&
    typeof v.motivation === 'number' &&
    typeof v.painFlag === 'boolean'
  );
}

function isRecord(value: unknown): value is DailyReadinessRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.date === 'string' &&
    isReadinessInputs(v.inputs) &&
    typeof v.score === 'number' &&
    READINESS_STATUSES.includes(v.status as ReadinessStatus) &&
    typeof v.recommendation === 'object' &&
    v.recommendation !== null &&
    typeof v.recommendationApplied === 'boolean' &&
    typeof v.submittedAt === 'string'
  );
}

function isStore(value: unknown): value is Store {
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value as Record<string, unknown>).every(([date, rec]) => isRecord(rec) && (rec as DailyReadinessRecord).date === date);
}

function loadStore(): Store {
  const result = loadVersioned<Store>({
    storageKey: STORAGE_KEY,
    currentVersion: DATA_VERSION,
    migrations: [],
    validate: isStore,
    fallback: () => ({}),
  });
  if (result.usedFallback && result.reason) {
    console.warn(`[DailyReadinessContext] starting with no readiness history: ${result.reason}`);
  }
  return result.data;
}

interface DailyReadinessContextValue {
  records: Store;
  today: string;
  /** The record for a specific local date, if a check-in was submitted that day. */
  getRecord: (date: string) => DailyReadinessRecord | undefined;
  /** Today's record, if the athlete has already checked in today. */
  getTodayRecord: () => DailyReadinessRecord | undefined;
  /** Every submitted record strictly before `date`, oldest first — only real
   * check-ins, no synthesized empty days (unlike LogContext's day logs, a
   * missing readiness check-in carries no information to report). */
  getHistoryBefore: (date: string) => DailyReadinessRecord[];
  /** All submitted records, oldest first. */
  getAllRecords: () => DailyReadinessRecord[];
  /** Submitted records with `startDate <= date <= endDate` (inclusive), oldest first —
   * only real check-ins, no synthesized empty days. Used to fold a specific calendar
   * week's readiness history into the Weekly Coaching Loop. */
  getRecordsInRange: (startDate: string, endDate: string) => DailyReadinessRecord[];
  /** The most recently submitted record, if any. */
  getLatestRecord: () => DailyReadinessRecord | null;
  /**
   * Sanitizes and scores `inputs` via the deterministic Readiness Engine and
   * upserts today's (or an explicitly-given) date's record. Returns the
   * computed record so the caller (the Daily Check-in screen) can act on it
   * immediately without a second render round-trip.
   */
  submitCheckIn: (inputs: DailyReadinessInputs, date?: string) => DailyReadinessRecord;
}

const DailyReadinessContext = createContext<DailyReadinessContextValue | null>(null);

export function DailyReadinessProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<Store>(loadStore);
  const today = localDateKey(new Date());

  function getRecord(date: string): DailyReadinessRecord | undefined {
    return records[date];
  }

  function getTodayRecord(): DailyReadinessRecord | undefined {
    return records[today];
  }

  function getHistoryBefore(date: string): DailyReadinessRecord[] {
    return Object.values(records)
      .filter((r) => r.date < date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function getAllRecords(): DailyReadinessRecord[] {
    return Object.values(records).sort((a, b) => a.date.localeCompare(b.date));
  }

  function getRecordsInRange(startDate: string, endDate: string): DailyReadinessRecord[] {
    return getAllRecords().filter((r) => r.date >= startDate && r.date <= endDate);
  }

  function getLatestRecord(): DailyReadinessRecord | null {
    const all = getAllRecords();
    return all.length > 0 ? all[all.length - 1] : null;
  }

  function submitCheckIn(rawInputs: DailyReadinessInputs, date: string = today): DailyReadinessRecord {
    const { value: inputs } = sanitizeReadinessInputs(rawInputs);
    const result = computeReadiness(inputs);
    const record: DailyReadinessRecord = {
      date,
      inputs: result.factors,
      score: result.score,
      status: result.status,
      recommendation: result.recommendation,
      recommendationApplied: result.recommendation.adjustmentApplied,
      submittedAt: new Date().toISOString(),
    };
    setRecords((prev) => {
      const next = { ...prev, [date]: record };
      saveVersioned(STORAGE_KEY, DATA_VERSION, next);
      return next;
    });
    return record;
  }

  const value = useMemo<DailyReadinessContextValue>(
    () => ({
      records,
      today,
      getRecord,
      getTodayRecord,
      getHistoryBefore,
      getAllRecords,
      getRecordsInRange,
      getLatestRecord,
      submitCheckIn,
    }),
    [records, today]
  );

  return <DailyReadinessContext.Provider value={value}>{children}</DailyReadinessContext.Provider>;
}

export function useDailyReadiness(): DailyReadinessContextValue {
  const ctx = useContext(DailyReadinessContext);
  if (!ctx) throw new Error('useDailyReadiness must be used within a DailyReadinessProvider');
  return ctx;
}
