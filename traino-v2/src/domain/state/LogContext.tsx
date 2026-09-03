import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MealSlot, PerformanceCategory } from '../engine/types';
import { addDays, daysBetween, localDateKey, parseLocalDateKey } from '../engine/dateUtils';
import { isValidWeightKg } from '../engine/validation';
import { loadVersioned, saveVersioned, type Migration } from './persistence';

const STORAGE_KEY = 'traino.logs';
const LEGACY_STORAGE_KEY = 'traino.logs.v1';
const LOGS_DATA_VERSION = 2;

export interface DayLog {
  date: string; // YYYY-MM-DD, local calendar date
  loggedMealSlots: MealSlot[];
  mealOverrides: Partial<Record<MealSlot, string>>;
  workoutCompleted: boolean;
  /** The completed workout's name (e.g. "Speed + Lower Body") — kept for display/debugging. */
  workoutName?: string;
  /** The completed workout's stat bucket, read straight off its WorkoutDayTemplate — this is
   * what Progress actually buckets by, not a guess from `workoutName`. */
  statCategory?: PerformanceCategory;
  weightKg?: number;
}

function emptyDayLog(date: string): DayLog {
  return { date, loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false };
}

type LogsByDate = Record<string, DayLog>;

function isDayLog(value: unknown, dateKey: string): value is DayLog {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.date === 'string' &&
    v.date === dateKey &&
    Array.isArray(v.loggedMealSlots) &&
    typeof v.mealOverrides === 'object' &&
    v.mealOverrides !== null &&
    typeof v.workoutCompleted === 'boolean'
  );
}

function isLogsByDate(value: unknown): value is LogsByDate {
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value as Record<string, unknown>).every(([key, day]) => isDayLog(day, key));
}

/** v1 (pre-migration-layer `traino.logs.v1` bare object, and the initial versioned shape) -> v2:
 * every day log must have `loggedMealSlots`/`mealOverrides` present (some early-build entries
 * only ever wrote `workoutCompleted`) so downstream code never has to null-check them. */
const v1ToV2: Migration = {
  fromVersion: 1,
  migrate: (data) => {
    const next: Record<string, unknown> = {};
    for (const [date, rawDay] of Object.entries(data)) {
      const day = (rawDay ?? {}) as Record<string, unknown>;
      next[date] = {
        ...day,
        date,
        loggedMealSlots: Array.isArray(day.loggedMealSlots) ? day.loggedMealSlots : [],
        mealOverrides: typeof day.mealOverrides === 'object' && day.mealOverrides !== null ? day.mealOverrides : {},
        workoutCompleted: Boolean(day.workoutCompleted),
      };
    }
    return next;
  },
};

function readLegacy(): { dataVersion: number; data: Record<string, unknown> } | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return null;
  return { dataVersion: 1, data: parsed };
}

function loadLogs(): LogsByDate {
  const result = loadVersioned<LogsByDate>({
    storageKey: STORAGE_KEY,
    currentVersion: LOGS_DATA_VERSION,
    migrations: [v1ToV2],
    validate: isLogsByDate,
    fallback: () => ({}),
    readLegacy,
  });
  if (result.usedFallback && result.reason) {
    console.warn(`[LogContext] starting with empty logs: ${result.reason}`);
  }
  return result.data;
}

interface LogContextValue {
  logs: LogsByDate;
  today: string;
  getDayLog: (date: string) => DayLog;
  toggleMealLogged: (date: string, slot: MealSlot) => void;
  setMealOverride: (date: string, slot: MealSlot, mealId: string) => void;
  setWorkoutCompleted: (date: string, completed: boolean, workoutName?: string, statCategory?: PerformanceCategory) => void;
  logWeight: (date: string, weightKg: number) => void;
  /** Most recent `days` day-logs, oldest first, including empty days with no activity. */
  getRecentLogs: (days: number) => DayLog[];
  /** Every day-log from `startDate` (inclusive) through today, oldest first, including empty
   * days — the calendar-complete window `computeProgressionInfo` needs to tell a missed week
   * apart from one that just hasn't happened yet. Returns [] if `startDate` is malformed or
   * in the future. */
  getLogsSince: (startDate: string) => DayLog[];
}

const LogContext = createContext<LogContextValue | null>(null);

export function LogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogsByDate>(loadLogs);
  const today = localDateKey(new Date());

  function updateDay(date: string, updater: (day: DayLog) => DayLog) {
    setLogs((prev) => {
      const current = prev[date] ?? emptyDayLog(date);
      const next = { ...prev, [date]: updater(current) };
      saveVersioned(STORAGE_KEY, LOGS_DATA_VERSION, next);
      return next;
    });
  }

  function getDayLog(date: string): DayLog {
    return logs[date] ?? emptyDayLog(date);
  }

  function toggleMealLogged(date: string, slot: MealSlot) {
    updateDay(date, (day) => {
      const has = day.loggedMealSlots.includes(slot);
      return {
        ...day,
        loggedMealSlots: has ? day.loggedMealSlots.filter((s) => s !== slot) : [...day.loggedMealSlots, slot],
      };
    });
  }

  function setMealOverride(date: string, slot: MealSlot, mealId: string) {
    updateDay(date, (day) => ({ ...day, mealOverrides: { ...day.mealOverrides, [slot]: mealId } }));
  }

  function setWorkoutCompleted(
    date: string,
    completed: boolean,
    workoutName?: string,
    statCategory?: PerformanceCategory
  ) {
    updateDay(date, (day) => ({
      ...day,
      workoutCompleted: completed,
      workoutName: completed ? (workoutName ?? day.workoutName) : day.workoutName,
      statCategory: completed ? (statCategory ?? day.statCategory) : day.statCategory,
    }));
  }

  function logWeight(date: string, weightKg: number) {
    if (!isValidWeightKg(weightKg)) {
      console.warn(`[LogContext] rejected weight log for ${date}: ${weightKg} is not a valid weight in kg`);
      return;
    }
    updateDay(date, (day) => ({ ...day, weightKg }));
  }

  function getRecentLogs(days: number): DayLog[] {
    const result: DayLog[] = [];
    const cursor = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() - i);
      result.push(getDayLog(localDateKey(d)));
    }
    return result;
  }

  function getLogsSince(startDate: string): DayLog[] {
    const start = parseLocalDateKey(startDate);
    if (!start) return [];
    const todayDate = new Date();
    const span = daysBetween(start, todayDate);
    if (span < 0) return [];
    const result: DayLog[] = [];
    for (let i = 0; i <= span; i++) {
      result.push(getDayLog(localDateKey(addDays(start, i))));
    }
    return result;
  }

  const value = useMemo<LogContextValue>(
    () => ({
      logs,
      today,
      getDayLog,
      toggleMealLogged,
      setMealOverride,
      setWorkoutCompleted,
      logWeight,
      getRecentLogs,
      getLogsSince,
    }),
    [logs, today]
  );

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useLogs(): LogContextValue {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error('useLogs must be used within a LogProvider');
  return ctx;
}
