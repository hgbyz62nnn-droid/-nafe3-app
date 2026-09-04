import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon, type IconName } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';
import { BottomNav } from '../components/ui/BottomNav';
import { useProfile } from '../domain/state/ProfileContext';
import { SPORTS } from '../domain/sports/sports';
import { GOAL_OPTIONS } from '../domain/assessment/goals';
import { EQUIPMENT_OPTIONS } from '../domain/assessment/equipment';

interface InfoRow {
  icon: IconName;
  label: string;
  value?: string;
  chevron?: boolean;
  /** Only rows meant to be tappable get one — the chevron affordance must
   * always match real behavior, never a fake/decorative arrow. */
  onSelect?: () => void;
}

function InfoList({ rows }: { rows: InfoRow[] }) {
  return (
    <div className="bg-card border border-border-soft rounded-card px-4">
      {rows.map((row, i) => {
        const rowClassName = `flex items-center gap-3 py-3.5 w-full text-left ${i < rows.length - 1 ? 'border-b border-border-soft' : ''}`;
        const content = (
          <>
            <Icon name={row.icon} size={17} className="text-text-secondary shrink-0" />
            <span className="flex-1 text-white text-[14px] font-medium">{row.label}</span>
            {row.value && (
              <span className="text-text-secondary text-[13px] shrink-0 truncate max-w-[150px]">
                {row.value}
              </span>
            )}
            {row.chevron && <Icon name="chevronRight" size={16} className="text-text-muted shrink-0" />}
          </>
        );
        return row.onSelect ? (
          <button key={row.label} onClick={row.onSelect} className={rowClassName}>
            {content}
          </button>
        ) : (
          <div key={row.label} className={rowClassName}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { answers } = useProfile();
  const sportName = SPORTS.find((s) => s.id === answers.sport)?.name ?? 'Athlete';
  const goalName = GOAL_OPTIONS.find((g) => g.id === answers.goal)?.name ?? 'Not set';
  const equipmentNames = answers.equipmentIds
    .map((id) => EQUIPMENT_OPTIONS.find((e) => e.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  const injuryLabel =
    answers.injuryIds.length === 0
      ? 'Not answered yet'
      : answers.injuryIds.includes('none')
        ? 'No injuries or limitations'
        : `${answers.injuryIds.length} noted`;

  // Editing reuses the existing assessment flow directly — no separate edit
  // UI. A general row (re-)enters at the start; a row that maps to one
  // specific existing assessment screen deep-links straight to it.
  const editWholeProfile = () => navigate('/onboarding/about');

  const MY_INFO: InfoRow[] = [
    { icon: 'profile', label: 'Athlete Profile', chevron: true, onSelect: editWholeProfile },
    { icon: 'bookmark', label: 'Goals', value: goalName },
    {
      icon: 'calendar',
      label: 'Training Schedule',
      value: answers.daysAvailablePerWeek > 0 ? `${answers.daysAvailablePerWeek} days / week` : 'Not set',
    },
    {
      icon: 'heart',
      label: 'Injuries & Health',
      value: injuryLabel,
      chevron: true,
      onSelect: () => navigate('/assessment/health'),
    },
    {
      icon: 'copy',
      label: 'Measurements',
      value: answers.weightKg > 0 ? `${answers.weightKg} kg, ${answers.heightCm} cm` : 'Not set',
    },
  ];

  const PREFERENCES: InfoRow[] = [
    {
      icon: 'dumbbell',
      label: 'Equipment',
      value: equipmentNames || 'Bodyweight only',
      chevron: true,
      onSelect: () => navigate('/equipment'),
    },
  ];

  return (
    <Screen>
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <div className="w-8 shrink-0" />
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          PROFILE
        </h1>
        <div className="flex items-center gap-3.5 shrink-0">
          <Icon name="notification" size={19} className="text-white" />
          <Icon name="settings" size={19} className="text-white" />
        </div>
      </div>

      <div className="flex items-center gap-3.5 px-4 mt-4">
        <AssetSlot
          className="w-16 h-16 min-w-[64px] rounded-full border-2 border-border-soft"
          fit="cover"
          compact
          placeholderIcon={<Icon name="profile" size={26} className="text-text-muted" />}
        />
        <div className="flex-1">
          <p className="text-white text-[18px] font-extrabold">{answers.firstName || 'Athlete'}</p>
          <p className="text-text-secondary text-[13px] mt-0.5">{sportName} Player</p>
          <button
            onClick={editWholeProfile}
            className="border border-border-soft rounded-chip px-3.5 py-1.5 text-white text-[12px] font-semibold mt-2"
          >
            Edit Profile
          </button>
        </div>
      </div>

      <p className="text-text-secondary text-[12px] font-bold tracking-wide px-4 mt-5">MY INFO</p>
      <div className="px-4 mt-2">
        <InfoList rows={MY_INFO} />
      </div>

      <p className="text-text-secondary text-[12px] font-bold tracking-wide px-4 mt-5">PREFERENCES</p>
      <div className="px-4 mt-2">
        <InfoList rows={PREFERENCES} />
      </div>

      <BottomNav />
    </Screen>
  );
}
