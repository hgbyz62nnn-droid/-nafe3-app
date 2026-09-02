import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AssessmentAnswers, UserProfile } from '../engine/types';
import { determineLevel } from '../engine/levelEngine';
import { calculateNutritionTargets } from '../engine/nutritionEngine';
import { getSportModule } from '../sports/registry';

const STORAGE_KEY = 'traino.assessmentAnswers.v1';

const DEFAULT_ANSWERS: AssessmentAnswers = {
  sport: 'football',
  goal: 'performance',
  experienceYears: 2,
  currentTrainingFrequency: 4,
  daysAvailablePerWeek: 4,
  trainingLocationIds: ['gym'],
  equipmentIds: ['dumbbells', 'barbell', 'resistance_bands'],
  injuryIds: [],
  sex: 'male',
  age: 24,
  heightCm: 178,
  weightKg: 76,
};

function loadStoredAnswers(): AssessmentAnswers {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ANSWERS;
    return { ...DEFAULT_ANSWERS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_ANSWERS;
  }
}

interface ProfileContextValue {
  answers: AssessmentAnswers;
  profile: UserProfile;
  updateAnswers: (partial: Partial<AssessmentAnswers>) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<AssessmentAnswers>(loadStoredAnswers);

  function updateAnswers(partial: Partial<AssessmentAnswers>) {
    setAnswers((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable (private mode etc.) — state still updates for this session.
      }
      return next;
    });
  }

  const profile = useMemo<UserProfile>(() => {
    const level = determineLevel(answers);
    const sportModule = getSportModule(answers.sport);
    const nutrition = calculateNutritionTargets(answers, sportModule.nutritionProfile);
    return { answers, level, nutrition };
  }, [answers]);

  const value = useMemo(() => ({ answers, profile, updateAnswers }), [answers, profile]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}
