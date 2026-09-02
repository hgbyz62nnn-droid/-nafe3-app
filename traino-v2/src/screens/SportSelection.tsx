import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { OnboardingHeader } from '../components/ui/OnboardingHeader';
import { AssetSlot } from '../components/ui/AssetSlot';
import { Icon } from '../components/ui/Icon';
import { SPORTS } from '../domain/sports/sports';
import { useProfile } from '../domain/state/ProfileContext';

function SportCard({
  name,
  selected,
  onClick,
  photoLabel,
}: {
  name: string;
  selected: boolean;
  onClick: () => void;
  photoLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-card-sm overflow-hidden aspect-[3/4] border-2 text-left transition-colors ${
        selected ? 'border-red' : 'border-border-soft'
      }`}
    >
      <AssetSlot
        className="absolute inset-0"
        label={photoLabel}
        labelPosition="top-left"
        placeholderIcon={<Icon name="fitness" size={30} />}
      />
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

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <OnboardingHeader title="Choose Your Sport" progress={2 / 8} />

      <div className="px-5 mt-5 grid grid-cols-2 gap-3">
        {SPORTS.map((sport) => (
          <SportCard
            key={sport.id}
            name={sport.name}
            photoLabel={sport.photoAssetLabel}
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
