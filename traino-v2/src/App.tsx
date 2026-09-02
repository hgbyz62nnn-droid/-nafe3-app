import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProfileProvider } from './domain/state/ProfileContext';
import Home from './screens/Home';
import SportSelection from './screens/SportSelection';
import AssessmentTrainingLocation from './screens/AssessmentTrainingLocation';
import Equipment from './screens/Equipment';
import AiCoach from './screens/AiCoach';
import TodaysWorkout from './screens/TodaysWorkout';
import Nutrition from './screens/Nutrition';
import Progress from './screens/Progress';
import WeeklyReport from './screens/WeeklyReport';
import HumanCoach from './screens/HumanCoach';
import Profile from './screens/Profile';

export default function App() {
  return (
    <ProfileProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sport-selection" element={<SportSelection />} />
          <Route path="/assessment" element={<AssessmentTrainingLocation />} />
          <Route path="/equipment" element={<Equipment />} />
          <Route path="/ai-coach" element={<AiCoach />} />
          <Route path="/todays-workout" element={<TodaysWorkout />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/weekly-report" element={<WeeklyReport />} />
          <Route path="/human-coach" element={<HumanCoach />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </BrowserRouter>
    </ProfileProvider>
  );
}
