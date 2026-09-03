import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AiCoachAdjustment, AssessmentAnswers, UserProfile } from '../engine/types';
import { determineLevel } from '../engine/levelEngine';
import { calculateNutritionTargets } from '../engine/nutritionEngine';
import { getSportModule } from '../sports/registry';
import { localDateKey } from '../engine/dateUtils';
import { sanitizeAssessmentAnswers } from '../engine/validation';
import { loadVersioned, saveVersioned, type Migration } from './persistence';

const STORAGE_KEY = 'traino.profile';
const LEGACY_STORAGE_KEY = 'traino.assessment.v2';
const PROFILE_DATA_VERSION = 3;

/**
 * Neutral bootstrapping state only — NOT a fake/demo athlete. `firstName`
 * and every preference/history field are genuinely unanswered (empty/
 * zero). The three body-stat fields (age/height/weight) are the one
 * exception: they can't be zero without breaking the nutrition formula
 * (BMR is linear in all three, so a zero — or a negative value for a
 * `sex: 'female'` default — produces NaN or negative calorie targets
 * before onboarding even renders). They hold small neutral placeholder
 * values purely so pre-assessment screens don't show broken math; the
 * assessment flow overwrites them with the athlete's real numbers, per
 * `hasCompletedAssessment`.
 */
const DEFAULT_ANSWERS: AssessmentAnswers = {
  firstName: '',
  sport: 'football',
  goal: 'general_fitness',
  experienceYears: 0,
  currentTrainingFrequency: 0,
  daysAvailablePerWeek: 0,
  trainingLocationIds: [],
  equipmentIds: [],
  injuryIds: ['none'],
  sex: 'male',
  age: 25,
  heightCm: 170,
  weightKg: 70,
  dietaryPreference: 'no_restriction',
  allergyIds: [],
  budgetTier: 'medium',
};

interface StoredState {
  answers: AssessmentAnswers;
  hasCompletedAssessment: boolean;
  /** Local date key (YYYY-MM-DD) the athlete's current training plan started on — the anchor
   * calendar-aware progression counts weeks from. Null until assessment is completed. */
  planStartDate: string | null;
}

function defaultState(): StoredState {
  return { answers: DEFAULT_ANSWERS, hasCompletedAssessment: false, planStartDate: null };
}

function isStoredState(value: unknown): value is StoredState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.hasCompletedAssessment !== 'boolean') return false;
  if (v.planStartDate !== null && typeof v.planStartDate !== 'string') return false;
  if (typeof v.answers !== 'object' || v.answers === null) return false;
  const a = v.answers as Record<string, unknown>;
  return (
    typeof a.firstName === 'string' &&
    typeof a.sport === 'string' &&
    typeof a.goal === 'string' &&
    typeof a.experienceYears === 'number' &&
    !Number.isNaN(a.experienceYears) &&
    typeof a.currentTrainingFrequency === 'number' &&
    !Number.isNaN(a.currentTrainingFrequency) &&
    typeof a.daysAvailablePerWeek === 'number' &&
    !Number.isNaN(a.daysAvailablePerWeek) &&
    Array.isArray(a.trainingLocationIds) &&
    Array.isArray(a.equipmentIds) &&
    Array.isArray(a.injuryIds) &&
    a.injuryIds.length > 0 &&
    typeof a.sex === 'string' &&
    typeof a.age === 'number' &&
    !Number.isNaN(a.age) &&
    typeof a.heightCm === 'number' &&
    !Number.isNaN(a.heightCm) &&
    typeof a.weightKg === 'number' &&
    !Number.isNaN(a.weightKg) &&
    typeof a.dietaryPreference === 'string' &&
    Array.isArray(a.allergyIds) &&
    typeof a.budgetTier === 'string'
  );
}

/** v1 (pre-migration-layer `traino.assessment.v2` shape, and the initial versioned shape
 * before `planStartDate` existed) -> v2: backfill `planStartDate` for anyone who had already
 * completed assessment, so calendar-aware progression has an anchor instead of defaulting
 * everyone to "week 1 forever". Anyone mid-assessment gets `null`, same as a fresh install. */
const v1ToV2: Migration = {
  fromVersion: 1,
  migrate: (data) => ({
    ...data,
    planStartDate: data.hasCompletedAssessment ? localDateKey(new Date()) : null,
  }),
};

/** v2 -> v3: an empty `injuryIds` (rather than the sentinel `['none']`) meant "no limitations"
 * under an earlier build but is ambiguous to the engine (empty ~ "not yet answered" everywhere
 * else) — normalize it explicitly so injury-substitution logic never has to guess. */
const v2ToV3: Migration = {
  fromVersion: 2,
  migrate: (data) => {
    const answers = (data.answers ?? {}) as Record<string, unknown>;
    const injuryIds = Array.isArray(answers.injuryIds) && answers.injuryIds.length > 0 ? answers.injuryIds : ['none'];
    return { ...data, answers: { ...answers, injuryIds } };
  },
};

function readLegacy(): { dataVersion: number; data: Record<string, unknown> } | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return {
    dataVersion: 1,
    data: {
      answers: { ...DEFAULT_ANSWERS, ...parsed.answers },
      hasCompletedAssessment: Boolean(parsed.hasCompletedAssessment),
    },
  };
}

function loadStoredState(): StoredState {
  const result = loadVersioned<StoredState>({
    storageKey: STORAGE_KEY,
    currentVersion: PROFILE_DATA_VERSION,
    migrations: [v1ToV2, v2ToV3],
    validate: isStoredState,
    fallback: defaultState,
    readLegacy,
  });
  if (result.usedFallback && result.reason) {
    console.warn(`[ProfileContext] using default profile: ${result.reason}`);
  }
  return {
    ...result.data,
    answers: { ...DEFAULT_ANSWERS, ...result.data.answers },
  };
}

interface ProfileContextValue {
  answers: AssessmentAnswers;
  profile: UserProfile;
  hasCompletedAssessment: boolean;
  planStartDate: string | null;
  updateAnswers: (partial: Partial<AssessmentAnswers>) => void;
  completeAssessment: () => void;
  /** The most recent AI Coach plan adjustment (e.g. "feeling tired" -> reduced volume),
   * applied to today's workout until cleared. Session-only, not persisted. */
  activeAdjustment: AiCoachAdjustment | null;
  setActiveAdjustment: (adjustment: AiCoachAdjustment | null) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(loadStoredState);
  const [activeAdjustment, setActiveAdjustment] = useState<AiCoachAdjustment | null>(null);

  function updateAnswers(partial: Partial<AssessmentAnswers>) {
    setState((prev) => {
      const next = { ...prev, answers: { ...prev.answers, ...partial } };
      saveVersioned(STORAGE_KEY, PROFILE_DATA_VERSION, next);
      return next;
    });
  }

  function completeAssessment() {
    setState((prev) => {
      const next: StoredState = {
        ...prev,
        hasCompletedAssessment: true,
        planStartDate: prev.planStartDate ?? localDateKey(new Date()),
      };
      saveVersioned(STORAGE_KEY, PROFILE_DATA_VERSION, next);
      return next;
    });
  }

  const profile = useMemo<UserProfile>(() => {
    const { value: safeAnswers, violations } = sanitizeAssessmentAnswers(state.answers);
    if (violations.length > 0) {
      console.warn('[ProfileContext] sanitized assessment answers before use:', violations);
    }
    const level = determineLevel(safeAnswers);
    const sportModule = getSportModule(safeAnswers.sport);
    const nutrition = calculateNutritionTargets(safeAnswers, sportModule.nutritionProfile);
    return { answers: safeAnswers, level, nutrition };
  }, [state.answers]);

  const value = useMemo(
    () => ({
      answers: state.answers,
      profile,
      hasCompletedAssessment: state.hasCompletedAssessment,
      planStartDate: state.planStartDate,
      updateAnswers,
      completeAssessment,
      activeAdjustment,
      setActiveAdjustment,
    }),
    [state, profile, activeAdjustment]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}
