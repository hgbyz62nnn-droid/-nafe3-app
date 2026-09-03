import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProfileProvider } from './domain/state/ProfileContext';
import { LogProvider } from './domain/state/LogContext';
import { WeeklyCoachingProvider } from './domain/state/WeeklyCoachingContext';
import { DailyReadinessProvider } from './domain/state/DailyReadinessContext';
import { ExercisePreferenceProvider } from './domain/state/ExercisePreferenceContext';
import { FoodPreferenceProvider } from './domain/state/FoodPreferenceContext';
import Home from './screens/Home';
import AssessmentAbout from './screens/AssessmentAbout';
import SportSelection from './screens/SportSelection';
import AssessmentTrainingLocation from './screens/AssessmentTrainingLocation';
import Equipment from './screens/Equipment';
import AssessmentExperience from './screens/AssessmentExperience';
import AssessmentHealth from './screens/AssessmentHealth';
import AssessmentBody from './screens/AssessmentBody';
import AssessmentNutritionPreferences from './screens/AssessmentNutritionPreferences';
import AiCoach from './screens/AiCoach';
import TodaysWorkout from './screens/TodaysWorkout';
import Nutrition from './screens/Nutrition';
import Progress from './screens/Progress';
import WeeklyReport from './screens/WeeklyReport';
import WeeklyCheckIn from './screens/WeeklyCheckIn';
import DailyCheckIn from './screens/DailyCheckIn';
import HumanCoach from './screens/HumanCoach';
import Profile from './screens/Profile';

export default function App() {
  return (
    <ProfileProvider>
      <LogProvider>
        <WeeklyCoachingProvider>
          <DailyReadinessProvider>
            <ExercisePreferenceProvider>
              <FoodPreferenceProvider>
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/onboarding/about" element={<AssessmentAbout />} />
                    <Route path="/sport-selection" element={<SportSelection />} />
                    <Route path="/assessment" element={<AssessmentTrainingLocation />} />
                    <Route path="/equipment" element={<Equipment />} />
                    <Route path="/assessment/experience" element={<AssessmentExperience />} />
                    <Route path="/assessment/health" element={<AssessmentHealth />} />
                    <Route path="/assessment/body" element={<AssessmentBody />} />
                    <Route path="/assessment/nutrition-preferences" element={<AssessmentNutritionPreferences />} />
                    <Route path="/ai-coach" element={<AiCoach />} />
                    <Route path="/todays-workout" element={<TodaysWorkout />} />
                    <Route path="/nutrition" element={<Nutrition />} />
                    <Route path="/progress" element={<Progress />} />
                    <Route path="/weekly-report" element={<WeeklyReport />} />
                    <Route path="/weekly-check-in" element={<WeeklyCheckIn />} />
                    <Route path="/daily-check-in" element={<DailyCheckIn />} />
                    <Route path="/human-coach" element={<HumanCoach />} />
                    <Route path="/profile" element={<Profile />} />
                  </Routes>
                </BrowserRouter>
              </FoodPreferenceProvider>
            </ExercisePreferenceProvider>
          </DailyReadinessProvider>
        </WeeklyCoachingProvider>
      </LogProvider>
    </ProfileProvider>
  );
}
