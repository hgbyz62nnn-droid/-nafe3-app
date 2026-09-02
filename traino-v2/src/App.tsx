import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './screens/Home';
import SportSelection from './screens/SportSelection';
import AssessmentTrainingLocation from './screens/AssessmentTrainingLocation';
import Equipment from './screens/Equipment';
import AiCoach from './screens/AiCoach';
import TodaysWorkout from './screens/TodaysWorkout';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sport-selection" element={<SportSelection />} />
        <Route path="/assessment" element={<AssessmentTrainingLocation />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/ai-coach" element={<AiCoach />} />
        <Route path="/todays-workout" element={<TodaysWorkout />} />
      </Routes>
    </BrowserRouter>
  );
}
