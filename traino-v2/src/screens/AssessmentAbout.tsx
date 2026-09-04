import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { OnboardingHeader } from '../components/ui/OnboardingHeader';
import { Icon } from '../components/ui/Icon';
import { GOAL_OPTIONS } from '../domain/assessment/goals';
import { useProfile } from '../domain/state/ProfileContext';
import type { Goal } from '../domain/engine/types';

export default function AssessmentAbout() {
  const navigate = useNavigate();
  const { answers, updateAnswers } = useProfile();

  function selectGoal(goal: Goal) {
    updateAnswers({ goal });
  }

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <OnboardingHeader title="About You" progress={1 / 9} />

      <div className="px-5 mt-4">
        <p className="text-text-secondary text-[12px] font-semibold">Step 1 of 9</p>
        <h1 className="text-white text-[24px] font-extrabold mt-1">What should we call you?</h1>

        <input
          type="text"
          value={answers.firstName}
          onChange={(e) => updateAnswers({ firstName: e.target.value })}
          placeholder="Your first name"
          className="w-full bg-card border border-border-soft rounded-card-sm px-4 py-3.5 mt-4 text-white text-[15px] placeholder:text-text-muted outline-none focus:border-red"
        />
      </div>

      <div className="px-5 mt-6">
        <h2 className="text-white text-[18px] font-extrabold">What's your main goal?</h2>
        <div className="mt-3 flex flex-col gap-2.5">
          {GOAL_OPTIONS.map((goal) => {
            const active = answers.goal === goal.id;
            return (
              <button
                key={goal.id}
                onClick={() => selectGoal(goal.id)}
                className={`flex items-center gap-3 rounded-card-sm border-2 px-3.5 py-3 text-left transition-colors ${
                  active ? 'border-red bg-card shadow-card-red' : 'border-border-soft bg-card'
                }`}
              >
                <span className="w-11 h-11 rounded-[12px] bg-card-nested flex items-center justify-center shrink-0">
                  <Icon name={goal.icon} size={20} className="text-white" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-white text-[14.5px] font-bold">{goal.name}</span>
                  <span className="block text-text-secondary text-[12.5px] mt-0.5">{goal.description}</span>
                </span>
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 ${
                    active ? 'bg-red border-red' : 'border-border-soft bg-transparent'
                  }`}
                >
                  {active && <Icon name="check" size={13} className="text-white" strokeWidth={2.4} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 mt-6">
        <button
          disabled={!answers.firstName.trim()}
          onClick={() => navigate('/sport-selection')}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button disabled:opacity-40"
        >
          NEXT
        </button>
      </div>
    </Screen>
  );
}
