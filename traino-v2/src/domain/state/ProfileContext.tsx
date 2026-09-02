import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AiCoachAdjustment, AssessmentAnswers, UserProfile } from '../engine/types';
import { determineLevel } from '../engine/levelEngine';
import { calculateNutritionTargets } from '../engine/nutritionEngine';
import { getSportModule } from '../sports/registry';

const STORAGE_KEY = 'traino.assessment.v2';

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
  /** The most recent AI Coach plan adjustment (e.g. "feeling tired" -> reduced volume),
   * applied to today's workout until cleared. Session-only, not persisted. */
  activeAdjustment: AiCoachAdjustment | null;
  setActiveAdjustment: (adjustment: AiCoachAdjustment | null) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(loadStoredState);
  const [activeAdjustment, setActiveAdjustment] = useState<AiCoachAdjustment | null>(null);

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
