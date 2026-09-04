import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProfileProvider } from './domain/state/ProfileContext';
import { LogProvider } from './domain/state/LogContext';
import { WeeklyCoachingProvider } from './domain/state/WeeklyCoachingContext';
import { DailyReadinessProvider } from './domain/state/DailyReadinessContext';
import { ExercisePreferenceProvider } from './domain/state/ExercisePreferenceContext';
import { FoodPreferenceProvider } from './domain/state/FoodPreferenceContext';
import { TrainingContextProvider } from './domain/state/TrainingContextStore';
import Home from './screens/Home';
import Welcome from './screens/Welcome';
import { useProfile } from './domain/state/ProfileContext';
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
import TravelCompetition from './screens/TravelCompetition';

/**
 * The root route: an athlete who hasn't completed the assessment yet sees
 * Welcome (the "Build Your Personal Plan" / "Create My Plan" entry point)
 * instead of Home, so the first-time journey is never ambiguous. A returning
 * athlete (hasCompletedAssessment) always lands on the normal Home dashboard.
 */
function RootScreen() {
  const { hasCompletedAssessment } = useProfile();
  return hasCompletedAssessment ? <Home /> : <Welcome />;
}

export default function App() {
  return (
    <ProfileProvider>
      <LogProvider>
        <WeeklyCoachingProvider>
          <DailyReadinessProvider>
            <ExercisePreferenceProvider>
              <FoodPreferenceProvider>
                <TrainingContextProvider>
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<RootScreen />} />
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
                    <Route path="/travel-competition" element={<TravelCompetition />} />
                  </Routes>
                </BrowserRouter>
                </TrainingContextProvider>
              </FoodPreferenceProvider>
            </ExercisePreferenceProvider>
          </DailyReadinessProvider>
        </WeeklyCoachingProvider>
      </LogProvider>
    </ProfileProvider>
  );
}
