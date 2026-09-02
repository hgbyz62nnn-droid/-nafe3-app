import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon, type IconName } from '../components/ui/Icon';

interface ReportRow {
  icon: IconName;
  color: string;
  label: string;
  value: string;
  secondary: string;
}

const ROWS: ReportRow[] = [
  { icon: 'checkPlain', color: '#3DDC84', label: 'Workouts', value: '4 / 4', secondary: 'Completed' },
  { icon: 'nutrition', color: '#3DDC84', label: 'Nutrition', value: '87%', secondary: 'Adherence' },
  { icon: 'clock', color: '#F5A623', label: 'Recovery', value: 'Good', secondary: 'Average 82%' },
  { icon: 'heart', color: '#E0272E', label: 'Weight', value: '-0.4 kg', secondary: 'vs last week' },
];

export default function WeeklyReport() {
  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          WEEKLY REPORT
        </h1>
        <Icon name="share" size={19} className="text-white shrink-0" />
      </div>

      <div className="px-4 mt-4">
        <h2 className="text-white text-[22px] font-extrabold leading-snug">
          Great work this week! <span>🔥</span>
        </h2>
        <p className="text-text-secondary text-[13.5px] mt-1.5 leading-relaxed">
          Your consistency and intensity are building real progress.
        </p>
      </div>

      <div className="px-4 mt-4">
        <div className="bg-card border border-border-soft rounded-card px-4">
          {ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`flex items-center gap-3 py-3.5 ${
                i < ROWS.length - 1 ? 'border-b border-border-soft' : ''
              }`}
            >
              <span
                className="w-8 h-8 min-w-[32px] rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${row.color}26` }}
              >
                <Icon name={row.icon} size={15} style={{ color: row.color }} strokeWidth={2.2} />
              </span>
              <span className="flex-1 text-white text-[14px] font-bold">{row.label}</span>
              <div className="flex items-baseline gap-2 shrink-0">
                <span className="text-white text-[13.5px] font-bold">{row.value}</span>
                <span className="text-text-muted text-[12px]">{row.secondary}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 mt-4">
        <div className="bg-card border border-border-soft rounded-card p-4">
          <p className="text-white text-[12px] font-extrabold tracking-wide">AI COACH FEEDBACK</p>
          <p className="text-text-secondary text-[13.5px] mt-2 leading-relaxed">
            Your lower-body performance improved and your nutrition consistency is great. Let's focus
            on upper body strength next week.
          </p>
        </div>
      </div>

      <div className="px-4 mt-4">
        <button className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button">
          VIEW NEXT WEEK PLAN
        </button>
      </div>
    </Screen>
  );
}
