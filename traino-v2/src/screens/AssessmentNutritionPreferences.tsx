import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { OnboardingHeader } from '../components/ui/OnboardingHeader';
import { Icon } from '../components/ui/Icon';
import { DIET_PREFERENCE_OPTIONS, ALLERGY_OPTIONS, BUDGET_OPTIONS } from '../domain/assessment/nutritionPreferences';
import { useProfile } from '../domain/state/ProfileContext';

export default function AssessmentNutritionPreferences() {
  const navigate = useNavigate();
  const { answers, updateAnswers, completeAssessment } = useProfile();
  const selectedAllergies = new Set(answers.allergyIds);

  function toggleAllergy(id: string) {
    const next = new Set(selectedAllergies);
    if (id === 'none') {
      updateAnswers({ allergyIds: next.has('none') ? [] : ['none'] });
      return;
    }
    next.delete('none');
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateAnswers({ allergyIds: Array.from(next) });
  }

  function finish() {
    completeAssessment();
    navigate('/');
  }

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <OnboardingHeader title="Nutrition" progress={8 / 8} />

      <div className="px-5 mt-4">
        <p className="text-text-secondary text-[12px] font-semibold">Step 8 of 8</p>
        <h1 className="text-white text-[24px] font-extrabold mt-1">Nutrition preferences</h1>
      </div>

      <div className="px-5 mt-4">
        <h2 className="text-white text-[15px] font-bold mb-2.5">Dietary preference</h2>
        <div className="flex flex-col gap-2.5">
          {DIET_PREFERENCE_OPTIONS.map((diet) => {
            const active = answers.dietaryPreference === diet.id;
            return (
              <button
                key={diet.id}
                onClick={() => updateAnswers({ dietaryPreference: diet.id })}
                className={`flex items-center gap-3 rounded-card-sm border-2 px-3.5 py-2.5 text-left ${
                  active ? 'border-red bg-card shadow-card-red' : 'border-border-soft bg-card'
                }`}
              >
                <Icon name={diet.icon} size={18} className="text-white shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-white text-[13.5px] font-bold">{diet.name}</span>
                  <span className="block text-text-secondary text-[11.5px]">{diet.description}</span>
                </span>
                {active && <Icon name="checkPlain" size={14} className="text-red shrink-0" strokeWidth={2.6} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 mt-5">
        <h2 className="text-white text-[15px] font-bold mb-2.5">Allergies</h2>
        <div className="flex flex-wrap gap-2">
          {ALLERGY_OPTIONS.map((a) => {
            const active = selectedAllergies.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggleAllergy(a.id)}
                className={`rounded-chip px-3.5 py-2 text-[12.5px] font-medium border ${
                  active ? 'border-red bg-red/15 text-white' : 'border-border-soft bg-card-nested text-text-secondary'
                }`}
              >
                {a.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 mt-5">
        <h2 className="text-white text-[15px] font-bold mb-2.5">Budget</h2>
        <div className="flex flex-col gap-2.5">
          {BUDGET_OPTIONS.map((b) => {
            const active = answers.budgetTier === b.id;
            return (
              <button
                key={b.id}
                onClick={() => updateAnswers({ budgetTier: b.id })}
                className={`flex items-center justify-between rounded-card-sm border-2 px-3.5 py-2.5 text-left ${
                  active ? 'border-red bg-card shadow-card-red' : 'border-border-soft bg-card'
                }`}
              >
                <span>
                  <span className="block text-white text-[13.5px] font-bold">{b.name}</span>
                  <span className="block text-text-secondary text-[11.5px]">{b.description}</span>
                </span>
                {active && <Icon name="checkPlain" size={14} className="text-red shrink-0" strokeWidth={2.6} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 mt-6">
        <button
          disabled={selectedAllergies.size === 0}
          onClick={finish}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button disabled:opacity-40"
        >
          BUILD MY PLAN
        </button>
      </div>
    </Screen>
  );
}
