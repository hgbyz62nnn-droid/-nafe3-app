import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { OnboardingHeader } from '../components/ui/OnboardingHeader';
import { Icon } from '../components/ui/Icon';
import { TRAINING_LOCATIONS } from '../domain/assessment/trainingLocations';
import { useProfile } from '../domain/state/ProfileContext';
import { useLocale } from '../domain/state/LocaleContext';
import { localizedOptionLabel } from '../domain/i18n/optionLabels';

export default function AssessmentTrainingLocation() {
  const navigate = useNavigate();
  const { answers, updateAnswers } = useProfile();
  const { locale } = useLocale();
  const selected = new Set(answers.trainingLocationIds);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateAnswers({ trainingLocationIds: Array.from(next) });
  }

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <OnboardingHeader title="Assessment" progress={3 / 9} />

      <div className="px-5 mt-4">
        <p className="text-text-secondary text-[12px] font-semibold">Step 3 of 9</p>
        <h1 className="text-white text-[24px] font-extrabold mt-1">Where do you train?</h1>
        <p className="text-text-secondary text-[13px] mt-1">You can select more than one</p>
      </div>

      <div className="px-5 mt-4 flex flex-col gap-2.5">
        {TRAINING_LOCATIONS.map((loc) => {
          const active = selected.has(loc.id);
          return (
            <button
              key={loc.id}
              onClick={() => toggle(loc.id)}
              className={`flex items-center gap-3 rounded-card-sm border-2 px-3.5 py-3 text-left transition-colors ${
                active ? 'border-red bg-card shadow-card-red' : 'border-border-soft bg-card'
              }`}
            >
              <span className="w-11 h-11 rounded-[12px] bg-card-nested flex items-center justify-center shrink-0">
                <Icon name={loc.icon} size={20} className="text-white" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-white text-[14.5px] font-bold">{localizedOptionLabel('location', loc.id, loc.name, locale)}</span>
                <span className="block text-text-secondary text-[12.5px] mt-0.5">{loc.description}</span>
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

      <div className="px-5 mt-5">
        <button
          disabled={selected.size === 0}
          onClick={() => navigate('/equipment')}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button disabled:opacity-40"
        >
          NEXT
        </button>
      </div>
    </Screen>
  );
}
