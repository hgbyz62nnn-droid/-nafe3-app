import { createContext, useContext, useState, type ReactNode } from 'react';
import type { MealSlot } from '../engine/types';

const STORAGE_KEY = 'traino.logs.v1';

export interface DayLog {
  date: string; // YYYY-MM-DD
  loggedMealSlots: MealSlot[];
  mealOverrides: Partial<Record<MealSlot, string>>;
  workoutCompleted: boolean;
  weightKg?: number;
}

function emptyDayLog(date: string): DayLog {
  return { date, loggedMealSlots: [], mealOverrides: {}, workoutCompleted: false };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
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
  setWorkoutCompleted: (date: string, completed: boolean) => void;
  logWeight: (date: string, weightKg: number) => void;
  /** Most recent `days` day-logs, oldest first, including empty days with no activity. */
  getRecentLogs: (days: number) => DayLog[];
}

const LogContext = createContext<LogContextValue | null>(null);

export function LogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogsByDate>(loadLogs);
  const today = todayKey();

  function persist(next: LogsByDate) {
    setLogs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable — state still updates for this session.
    }
  }

  function getDayLog(date: string): DayLog {
    return logs[date] ?? emptyDayLog(date);
  }

  function updateDay(date: string, updater: (day: DayLog) => DayLog) {
    const current = getDayLog(date);
    persist({ ...logs, [date]: updater(current) });
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

  function setWorkoutCompleted(date: string, completed: boolean) {
    updateDay(date, (day) => ({ ...day, workoutCompleted: completed }));
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
      const key = d.toISOString().slice(0, 10);
      result.push(getDayLog(key));
    }
    return result;
  }

  const value: LogContextValue = {
    logs,
    today,
    getDayLog,
    toggleMealLogged,
    setMealOverride,
    setWorkoutCompleted,
    logWeight,
    getRecentLogs,
  };

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useLogs(): LogContextValue {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error('useLogs must be used within a LogProvider');
  return ctx;
}
