import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { OnboardingHeader } from '../components/ui/OnboardingHeader';
import { Icon, type IconName } from '../components/ui/Icon';
import { SPORTS } from '../domain/sports/sports';
import { useProfile } from '../domain/state/ProfileContext';
import { useLocale } from '../domain/state/LocaleContext';
import { localizedOptionLabel } from '../domain/i18n/optionLabels';

/** No real per-sport photography exists yet — rather than a fabricated
 * image URL or a visible "· placeholder" tag on every card (spec §31), each
 * sport gets a clean, consistent icon from the existing TRAINO icon system.
 * Falls back to the generic 'fitness' icon for a sport with no closer match
 * in the current icon set, rather than inventing a new one. */
const SPORT_ICON: Partial<Record<string, IconName>> = {
  football: 'target',
  basketball: 'target',
  swimming: 'pool',
  boxing: 'fitness',
  tennis: 'target',
  running: 'fitness',
  gym_fitness: 'dumbbell',
  volleyball: 'fitness',
  athletics: 'trophy',
  martial_arts: 'fitness',
};

function SportCard({
  id,
  name,
  selected,
  onClick,
}: {
  id: string;
  name: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-card-sm overflow-hidden aspect-[3/4] border-2 text-left transition-colors bg-card-nested ${
        selected ? 'border-red' : 'border-border-soft'
      }`}
    >
      <div className="absolute inset-0 flex items-center justify-center text-text-muted">
        <Icon name={SPORT_ICON[id] ?? 'fitness'} size={34} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <p className="absolute left-0 right-0 bottom-3 text-center text-white text-[15px] font-bold px-1">
        {name}
      </p>
      {selected && (
        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red flex items-center justify-center">
          <Icon name="check" size={14} className="text-white" strokeWidth={2.2} />
        </span>
      )}
    </button>
  );
}

export default function SportSelection() {
  const navigate = useNavigate();
  const { answers, updateAnswers } = useProfile();
  const { locale } = useLocale();

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <OnboardingHeader title="Choose Your Sport" progress={2 / 9} />

      <div className="px-5 mt-5 grid grid-cols-2 gap-3">
        {SPORTS.map((sport) => (
          <SportCard
            key={sport.id}
            id={sport.id}
            name={localizedOptionLabel('sport', sport.id, sport.name, locale)}
            selected={answers.sport === sport.id}
            onClick={() => updateAnswers({ sport: sport.id })}
          />
        ))}
      </div>

      <div className="px-5 mt-5">
        <button
          onClick={() => navigate('/assessment')}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button"
        >
          NEXT
        </button>
      </div>
    </Screen>
  );
}
