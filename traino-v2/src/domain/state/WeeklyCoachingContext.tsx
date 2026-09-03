import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ApprovalStatus, CoachingDecision, WeeklyCheckIn, WeeklyCoachingRecord } from '../coaching/types';
import { loadVersioned, saveVersioned } from './persistence';

/**
 * Persisted store for the Weekly Coaching Loop — one record per reviewed
 * plan week, keyed by `reviewedPlanWeek`. Uses the exact same versioned
 * load/save infrastructure ProfileContext and LogContext already use
 * (`domain/state/persistence.ts`), so this is part of the existing
 * persistence architecture, not a new one-off mechanism.
 *
 * Records are append/patch-only per week: `saveReview` creates a week's
 * record once (check-in + computed decision), and `approve`/`reject` only
 * ever change that same record's `approvalStatus` — a prior week's record
 * is never rewritten by a later week's review, keeping historical weeks
 * immutable while still auditable (checkIn + decision + approval all live
 * together on the one record).
 */

const STORAGE_KEY = 'traino.weeklyCoaching';
const DATA_VERSION = 1;

type Store = Record<number, WeeklyCoachingRecord>;

function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected' || value === 'not_applicable';
}

function isCheckIn(value: unknown): value is WeeklyCheckIn {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.barrierIds) && typeof v.submittedAt === 'string';
}

function isDecision(value: unknown): value is CoachingDecision {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.recommendedAction === 'string' && typeof v.requiresApproval === 'boolean';
}

function isRecord(value: unknown): value is WeeklyCoachingRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.reviewedPlanWeek === 'number' &&
    typeof v.appliesFromPlanWeek === 'number' &&
    typeof v.weekStartDateKey === 'string' &&
    (v.checkIn === null || isCheckIn(v.checkIn)) &&
    (v.decision === null || isDecision(v.decision)) &&
    isApprovalStatus(v.approvalStatus)
  );
}

function isStore(value: unknown): value is Store {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value as Record<string, unknown>).every(isRecord);
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
    console.warn(`[WeeklyCoachingContext] starting with no coaching history: ${result.reason}`);
  }
  return result.data;
}

interface WeeklyCoachingContextValue {
  records: Store;
  getRecord: (planWeek: number) => WeeklyCoachingRecord | undefined;
  /** All reviewed weeks strictly before `planWeek`, oldest first — the input
   * detectRecurringPattern expects. */
  getHistoryBefore: (planWeek: number) => WeeklyCoachingRecord[];
  /** The approved record (if any) whose recommendation takes effect starting `planWeek`. */
  getApprovedAdjustmentForWeek: (planWeek: number) => WeeklyCoachingRecord | null;
  /** The most recently reviewed week's record, if any — what the AI Coach's weekly-
   * coaching intents ("why did my consistency drop?" etc.) read from. */
  getLatestRecord: () => WeeklyCoachingRecord | null;
  saveReview: (
    reviewedPlanWeek: number,
    weekStartDateKey: string,
    checkIn: WeeklyCheckIn | null,
    decision: CoachingDecision,
    readinessNote?: string | null
  ) => void;
  approve: (reviewedPlanWeek: number) => void;
  reject: (reviewedPlanWeek: number) => void;
}

const WeeklyCoachingContext = createContext<WeeklyCoachingContextValue | null>(null);

export function WeeklyCoachingProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<Store>(loadStore);

  function getRecord(planWeek: number): WeeklyCoachingRecord | undefined {
    return records[planWeek];
  }

  function getHistoryBefore(planWeek: number): WeeklyCoachingRecord[] {
    return Object.values(records)
      .filter((r) => r.reviewedPlanWeek < planWeek)
      .sort((a, b) => a.reviewedPlanWeek - b.reviewedPlanWeek);
  }

  function getApprovedAdjustmentForWeek(planWeek: number): WeeklyCoachingRecord | null {
    const match = Object.values(records).find((r) => r.appliesFromPlanWeek === planWeek && r.approvalStatus === 'approved');
    return match ?? null;
  }

  function getLatestRecord(): WeeklyCoachingRecord | null {
    const all = Object.values(records);
    if (all.length === 0) return null;
    return all.reduce((latest, r) => (r.reviewedPlanWeek > latest.reviewedPlanWeek ? r : latest));
  }

  function saveReview(
    reviewedPlanWeek: number,
    weekStartDateKey: string,
    checkIn: WeeklyCheckIn | null,
    decision: CoachingDecision,
    readinessNote: string | null = null
  ) {
    setRecords((prev) => {
      const record: WeeklyCoachingRecord = {
        reviewedPlanWeek,
        appliesFromPlanWeek: reviewedPlanWeek + 1,
        weekStartDateKey,
        checkIn,
        decision,
        approvalStatus: decision.requiresApproval ? 'pending' : 'not_applicable',
        decidedAt: null,
        readinessNote,
      };
      const next = { ...prev, [reviewedPlanWeek]: record };
      saveVersioned(STORAGE_KEY, DATA_VERSION, next);
      return next;
    });
  }

  function setApproval(reviewedPlanWeek: number, status: 'approved' | 'rejected') {
    setRecords((prev) => {
      const existing = prev[reviewedPlanWeek];
      if (!existing) return prev;
      const next = { ...prev, [reviewedPlanWeek]: { ...existing, approvalStatus: status, decidedAt: new Date().toISOString() } };
      saveVersioned(STORAGE_KEY, DATA_VERSION, next);
      return next;
    });
  }

  const value = useMemo<WeeklyCoachingContextValue>(
    () => ({
      records,
      getRecord,
      getHistoryBefore,
      getApprovedAdjustmentForWeek,
      getLatestRecord,
      saveReview,
      approve: (planWeek: number) => setApproval(planWeek, 'approved'),
      reject: (planWeek: number) => setApproval(planWeek, 'rejected'),
    }),
    [records]
  );

  return <WeeklyCoachingContext.Provider value={value}>{children}</WeeklyCoachingContext.Provider>;
}

export function useWeeklyCoaching(): WeeklyCoachingContextValue {
  const ctx = useContext(WeeklyCoachingContext);
  if (!ctx) throw new Error('useWeeklyCoaching must be used within a WeeklyCoachingProvider');
  return ctx;
}
