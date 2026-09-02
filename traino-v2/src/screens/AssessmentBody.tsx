import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { OnboardingHeader } from '../components/ui/OnboardingHeader';
import { useProfile } from '../domain/state/ProfileContext';
import type { Sex } from '../domain/engine/types';

function NumberField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex-1">
      <p className="text-text-secondary text-[12px] font-semibold mb-1.5">{label}</p>
      <div className="flex items-center bg-card border border-border-soft rounded-card-sm px-3.5 py-3 focus-within:border-red">
        <input
          type="number"
          inputMode="numeric"
          value={value || ''}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full bg-transparent text-white text-[15px] outline-none min-w-0"
        />
        <span className="text-text-muted text-[13px] shrink-0">{unit}</span>
      </div>
    </div>
  );
}

export default function AssessmentBody() {
  const navigate = useNavigate();
  const { answers, updateAnswers } = useProfile();

  const canContinue = answers.age > 0 && answers.heightCm > 0 && answers.weightKg > 0;

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <OnboardingHeader title="Body Data" progress={7 / 8} />

      <div className="px-5 mt-4">
        <p className="text-text-secondary text-[12px] font-semibold">Step 7 of 8</p>
        <h1 className="text-white text-[24px] font-extrabold mt-1">Tell us about your body</h1>
        <p className="text-text-secondary text-[13px] mt-1">
          Used to calculate your calorie and macro targets
        </p>
      </div>

      <div className="px-5 mt-4">
        <p className="text-text-secondary text-[12px] font-semibold mb-1.5">Sex</p>
        <div className="grid grid-cols-2 gap-2.5">
          {(['male', 'female'] as Sex[]).map((sex) => {
            const active = answers.sex === sex;
            return (
              <button
                key={sex}
                onClick={() => updateAnswers({ sex })}
                className={`rounded-card-sm border-2 px-3.5 py-3 text-left bg-card capitalize ${
                  active ? 'border-red shadow-card-red' : 'border-border-soft'
                }`}
              >
                <span className="text-white text-[14px] font-bold">{sex}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 mt-4 flex gap-3">
        <NumberField label="Age" unit="yrs" value={answers.age} onChange={(age) => updateAnswers({ age })} />
        <NumberField
          label="Height"
          unit="cm"
          value={answers.heightCm}
          onChange={(heightCm) => updateAnswers({ heightCm })}
        />
        <NumberField
          label="Weight"
          unit="kg"
          value={answers.weightKg}
          onChange={(weightKg) => updateAnswers({ weightKg })}
        />
      </div>

      <div className="px-5 mt-6">
        <button
          disabled={!canContinue}
          onClick={() => navigate('/assessment/nutrition-preferences')}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button disabled:opacity-40"
        >
          NEXT
        </button>
      </div>
    </Screen>
  );
}
