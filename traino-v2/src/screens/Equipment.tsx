import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { OnboardingHeader } from '../components/ui/OnboardingHeader';
import { Icon } from '../components/ui/Icon';
import { EQUIPMENT_OPTIONS } from '../domain/assessment/equipment';
import { useProfile } from '../domain/state/ProfileContext';
import { useLocale } from '../domain/state/LocaleContext';
import { localizedOptionLabel } from '../domain/i18n/optionLabels';

export default function Equipment() {
  const navigate = useNavigate();
  const { answers, updateAnswers } = useProfile();
  const { locale } = useLocale();
  const selected = new Set(answers.equipmentIds);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateAnswers({ equipmentIds: Array.from(next) });
  }

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <OnboardingHeader title="Equipment" progress={4 / 9} />

      <div className="px-5 mt-4">
        <p className="text-text-secondary text-[12px] font-semibold">Step 4 of 9</p>
        <h1 className="text-white text-[24px] font-extrabold mt-1 leading-tight">
          What equipment
          <br />
          do you have?
        </h1>
        <p className="text-text-secondary text-[13px] mt-1">Select all that apply</p>
      </div>

      <div className="px-5 mt-4 grid grid-cols-3 gap-2.5">
        {EQUIPMENT_OPTIONS.map((eq) => {
          const active = selected.has(eq.id);
          return (
            <button
              key={eq.id}
              onClick={() => toggle(eq.id)}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-card-sm border-2 py-4 px-1.5 bg-card ${
                active ? 'border-red shadow-card-red' : 'border-border-soft'
              }`}
            >
              {active && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 min-w-[20px] min-h-[20px] rounded-full bg-red border-2 border-bg flex items-center justify-center">
                  <Icon name="check" size={10} className="text-white" strokeWidth={2.8} />
                </span>
              )}
              <Icon name={eq.icon} size={24} className="text-white" />
              <span className="text-white text-[11px] font-semibold text-center leading-tight">
                {localizedOptionLabel('equipment', eq.id, eq.name, locale)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="px-5 mt-5">
        <button
          onClick={() => navigate('/assessment/experience')}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button"
        >
          NEXT
        </button>
      </div>
    </Screen>
  );
}
