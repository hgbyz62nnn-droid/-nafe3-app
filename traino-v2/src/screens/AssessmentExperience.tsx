import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { OnboardingHeader } from '../components/ui/OnboardingHeader';
import { Icon } from '../components/ui/Icon';
import { EXPERIENCE_OPTIONS, FREQUENCY_OPTIONS, type BucketOption } from '../domain/assessment/experience';
import { useProfile } from '../domain/state/ProfileContext';

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

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <OnboardingHeader title="Experience" progress={5 / 8} />

      <div className="px-5 mt-4">
        <p className="text-text-secondary text-[12px] font-semibold">Step 5 of 8</p>
        <h1 className="text-white text-[22px] font-extrabold mt-1">
          How much training experience do you have?
        </h1>
        <BucketGrid
          options={EXPERIENCE_OPTIONS}
          value={answers.experienceYears}
          onSelect={(opt) => updateAnswers({ experienceYears: opt.value })}
        />
      </div>

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
