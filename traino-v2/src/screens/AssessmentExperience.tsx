import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { OnboardingHeader } from '../components/ui/OnboardingHeader';
import { Icon } from '../components/ui/Icon';
import { EXPERIENCE_OPTIONS, FREQUENCY_OPTIONS, DURATION_OPTIONS, PRIORITY_OPTIONS, type BucketOption } from '../domain/assessment/experience';
import { useProfile } from '../domain/state/ProfileContext';
import { getSportModule } from '../domain/sports/registry';

function BucketGrid({
  options,
  value,
  onSelect,
}: {
  options: BucketOption[];
  value: number;
  onSelect: (option: BucketOption) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 mt-3">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt)}
            className={`relative flex flex-col items-start gap-1 rounded-card-sm border-2 px-3.5 py-3 text-left bg-card ${
              active ? 'border-red shadow-card-red' : 'border-border-soft'
            }`}
          >
            {active && (
              <span className="absolute top-2 right-2 w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full bg-red flex items-center justify-center">
                <Icon name="checkPlain" size={10} className="text-white" strokeWidth={2.8} />
              </span>
            )}
            <span className="text-white text-[14px] font-bold">{opt.label}</span>
            <span className="text-text-secondary text-[12px]">{opt.description}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Experience years, current training frequency, and committed future
 * frequency are three genuinely independent answers — each has its own
 * BucketGrid writing to its own AssessmentAnswers field. None of these
 * handlers may touch more than one field: experienceYears feeds
 * levelEngine's experience axis, currentTrainingFrequency feeds its
 * separate frequency axis, and daysAvailablePerWeek feeds the nutrition
 * activity multiplier and the "workouts planned" denominator elsewhere.
 * They can legitimately differ (e.g. someone who currently trains 2x/week
 * but is committing to 5x/week going forward).
 */
export default function AssessmentExperience() {
  const navigate = useNavigate();
  const { answers, updateAnswers } = useProfile();
  const positions = getSportModule(answers.sport).positions ?? [];

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <OnboardingHeader title="Training" progress={5 / 9} />

      <div className="px-5 mt-4">
        <p className="text-text-secondary text-[12px] font-semibold">Step 5 of 9</p>
        <h1 className="text-white text-[22px] font-extrabold mt-1">
          How much training experience do you have?
        </h1>
        <BucketGrid
          options={EXPERIENCE_OPTIONS}
          value={answers.experienceYears}
          onSelect={(opt) => updateAnswers({ experienceYears: opt.value })}
        />
      </div>

      {positions.length > 0 && (
        <div className="px-5 mt-6">
          <h2 className="text-white text-[18px] font-extrabold">What's your position / discipline?</h2>
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            {positions.map((p) => {
              const active = answers.sportPositionId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => updateAnswers({ sportPositionId: p.id })}
                  className={`relative rounded-card-sm border-2 px-3.5 py-3 text-left bg-card ${
                    active ? 'border-red shadow-card-red' : 'border-border-soft'
                  }`}
                >
                  {active && (
                    <span className="absolute top-2 right-2 w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full bg-red flex items-center justify-center">
                      <Icon name="checkPlain" size={10} className="text-white" strokeWidth={2.8} />
                    </span>
                  )}
                  <span className="text-white text-[14px] font-bold">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-5 mt-6">
        <h2 className="text-white text-[18px] font-extrabold">How many days a week do you currently train?</h2>
        <BucketGrid
          options={FREQUENCY_OPTIONS}
          value={answers.currentTrainingFrequency}
          onSelect={(opt) => updateAnswers({ currentTrainingFrequency: opt.value })}
        />
      </div>

      <div className="px-5 mt-6">
        <h2 className="text-white text-[18px] font-extrabold">How many days a week can you commit going forward?</h2>
        <BucketGrid
          options={FREQUENCY_OPTIONS}
          value={answers.daysAvailablePerWeek}
          onSelect={(opt) => updateAnswers({ daysAvailablePerWeek: opt.value })}
        />
      </div>

      <div className="px-5 mt-6">
        <h2 className="text-white text-[18px] font-extrabold">How long do you want each session to be?</h2>
        <BucketGrid
          options={DURATION_OPTIONS}
          value={answers.sessionDurationMin ?? 45}
          onSelect={(opt) => updateAnswers({ sessionDurationMin: opt.value })}
        />
      </div>

      <div className="px-5 mt-6">
        <h2 className="text-white text-[18px] font-extrabold">What should we prioritize?</h2>
        <div className="flex flex-col gap-2.5 mt-3">
          {PRIORITY_OPTIONS.map((p) => {
            const active = (answers.performancePriority ?? 'strength') === p.id;
            return (
              <button
                key={p.id}
                onClick={() => updateAnswers({ performancePriority: p.id })}
                className={`flex items-center gap-3 rounded-card-sm border-2 px-3.5 py-2.5 text-left bg-card ${
                  active ? 'border-red shadow-card-red' : 'border-border-soft'
                }`}
              >
                <Icon name={p.icon} size={18} className="text-white shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-white text-[13.5px] font-bold">{p.name}</span>
                  <span className="block text-text-secondary text-[11.5px]">{p.description}</span>
                </span>
                {active && <Icon name="checkPlain" size={14} className="text-red shrink-0" strokeWidth={2.6} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 mt-6">
        <button
          onClick={() => navigate('/assessment/health')}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button"
        >
          NEXT
        </button>
      </div>
    </Screen>
  );
}
