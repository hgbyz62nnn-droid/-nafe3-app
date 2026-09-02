import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AssessmentAnswers, UserProfile } from '../engine/types';
import { determineLevel } from '../engine/levelEngine';
import { calculateNutritionTargets } from '../engine/nutritionEngine';
import { getSportModule } from '../sports/registry';

const STORAGE_KEY = 'traino.assessment.v2';

/**
 * Neutral bootstrapping state only — NOT a fake/demo athlete. Every field
 * here is "unanswered" (empty/zero) except the two that need *some* valid
 * enum value to keep the app rendering before onboarding: `sport` (so a
 * program can resolve) and `sex` (so nutrition math doesn't branch on
 * undefined). The assessment flow overwrites all of this with the real
 * user's answers; `hasCompletedAssessment` tracks whether that has
 * happened yet.
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
  injuryIds: [],
  sex: 'male',
  age: 0,
  heightCm: 0,
  weightKg: 0,
  dietaryPreference: 'no_restriction',
  allergyIds: [],
  budgetTier: 'medium',
};

interface StoredState {
  answers: AssessmentAnswers;
  hasCompletedAssessment: boolean;
}

function loadStoredState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { answers: DEFAULT_ANSWERS, hasCompletedAssessment: false };
    const parsed = JSON.parse(raw);
    return {
      answers: { ...DEFAULT_ANSWERS, ...parsed.answers },
      hasCompletedAssessment: Boolean(parsed.hasCompletedAssessment),
    };
  } catch {
    return { answers: DEFAULT_ANSWERS, hasCompletedAssessment: false };
  }
}

interface ProfileContextValue {
  answers: AssessmentAnswers;
  profile: UserProfile;
  hasCompletedAssessment: boolean;
  updateAnswers: (partial: Partial<AssessmentAnswers>) => void;
  completeAssessment: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(loadStoredState);

  function persist(next: StoredState) {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable (private mode etc.) — state still updates for this session.
    }
  }

  function updateAnswers(partial: Partial<AssessmentAnswers>) {
    persist({ ...state, answers: { ...state.answers, ...partial } });
  }

  function completeAssessment() {
    persist({ ...state, hasCompletedAssessment: true });
  }

  const profile = useMemo<UserProfile>(() => {
    const level = determineLevel(state.answers);
    const sportModule = getSportModule(state.answers.sport);
    const nutrition = calculateNutritionTargets(state.answers, sportModule.nutritionProfile);
    return { answers: state.answers, level, nutrition };
  }, [state.answers]);

  const value = useMemo(
    () => ({
      answers: state.answers,
      profile,
      hasCompletedAssessment: state.hasCompletedAssessment,
      updateAnswers,
      completeAssessment,
    }),
    [state, profile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}
