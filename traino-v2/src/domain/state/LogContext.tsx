import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MealSlot, PerformanceCategory } from '../engine/types';

const STORAGE_KEY = 'traino.logs.v1';

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

/** Local calendar date (not UTC) — a workout logged at 11pm should count for
 * the athlete's local "today", not flip to tomorrow for negative-UTC-offset users. */
function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type LogsByDate = Record<string, DayLog>;

function loadLogs(): LogsByDate {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
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
}

const LogContext = createContext<LogContextValue | null>(null);

export function LogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogsByDate>(loadLogs);
  const today = localDateKey(new Date());

  function updateDay(date: string, updater: (day: DayLog) => DayLog) {
    setLogs((prev) => {
      const current = prev[date] ?? emptyDayLog(date);
      const next = { ...prev, [date]: updater(current) };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable — state still updates for this session.
      }
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
