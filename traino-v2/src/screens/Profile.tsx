import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon, type IconName } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';
import { BottomNav } from '../components/ui/BottomNav';

interface InfoRow {
  icon: IconName;
  label: string;
  value?: string;
  chevron?: boolean;
}

const MY_INFO: InfoRow[] = [
  { icon: 'profile', label: 'Athlete Profile', chevron: true },
  { icon: 'bookmark', label: 'Goals', value: 'Improve Performance' },
  { icon: 'calendar', label: 'Training Schedule', value: '4 days / week' },
  { icon: 'heart', label: 'Injuries & Health', chevron: true },
  { icon: 'copy', label: 'Measurements', value: '72 kg, 175 cm' },
];

const PREFERENCES: InfoRow[] = [
  { icon: 'dumbbell', label: 'Equipment', value: 'Gym, Dumbbells, Barbell...', chevron: true },
];

function InfoList({ rows }: { rows: InfoRow[] }) {
  return (
    <div className="bg-card border border-border-soft rounded-card px-4">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`flex items-center gap-3 py-3.5 ${i < rows.length - 1 ? 'border-b border-border-soft' : ''}`}
        >
          <Icon name={row.icon} size={17} className="text-text-secondary shrink-0" />
          <span className="flex-1 text-white text-[14px] font-medium">{row.label}</span>
          {row.value && (
            <span className="text-text-secondary text-[13px] shrink-0 truncate max-w-[150px]">
              {row.value}
            </span>
          )}
          {row.chevron && <Icon name="chevronRight" size={16} className="text-text-muted shrink-0" />}
        </div>
      ))}
    </div>
  );
}

export default function Profile() {
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
          <p className="text-white text-[18px] font-extrabold">Abdallah M.</p>
          <p className="text-text-secondary text-[13px] mt-0.5">Football Player</p>
          <button className="border border-border-soft rounded-chip px-3.5 py-1.5 text-white text-[12px] font-semibold mt-2">
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
