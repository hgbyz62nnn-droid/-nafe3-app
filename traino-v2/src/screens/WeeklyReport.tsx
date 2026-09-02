import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon, type IconName } from '../components/ui/Icon';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import {
  computePerformanceStats,
  computeWorkoutCompletion,
  computeNutritionAdherence,
  computeRecoveryScore,
} from '../domain/engine/progressEngine';
import { generateWeeklyReport, type ReportArea } from '../domain/engine/weeklyReportEngine';

interface ReportRow {
  icon: IconName;
  color: string;
  label: string;
  value: string;
  secondary: string;
}

export default function WeeklyReport() {
  const { answers } = useProfile();
  const { getRecentLogs } = useLogs();

  const last7 = getRecentLogs(7);
  const last14 = getRecentLogs(14);
  const prior7 = last14.slice(0, 7);

  const { completed } = computeWorkoutCompletion(last7);
  const planned = Math.max(answers.daysAvailablePerWeek, 1);
  const nutritionAdherencePct = computeNutritionAdherence(last7);
  const recoveryAveragePct = computeRecoveryScore(last7, answers.daysAvailablePerWeek);

  const thisWeekWeights = last7.filter((d) => typeof d.weightKg === 'number');
  const priorWeekWeights = prior7.filter((d) => typeof d.weightKg === 'number');
  const weightDeltaKg =
    thisWeekWeights.length > 0 && priorWeekWeights.length > 0
      ? Math.round((thisWeekWeights[thisWeekWeights.length - 1].weightKg! - priorWeekWeights[priorWeekWeights.length - 1].weightKg!) * 10) / 10
      : 0;

  const stats = computePerformanceStats(last7);
  const scores: { area: ReportArea; score: number }[] = [
    { area: 'speed', score: stats.speed.hasData ? 50 + Math.max(-50, Math.min(50, stats.speed.changePct)) : 20 },
    { area: 'strength', score: stats.strength.hasData ? 50 + Math.max(-50, Math.min(50, stats.strength.changePct)) : 20 },
    { area: 'stamina', score: stats.stamina.hasData ? 50 + Math.max(-50, Math.min(50, stats.stamina.changePct)) : 20 },
    { area: 'nutrition', score: nutritionAdherencePct },
    { area: 'recovery', score: recoveryAveragePct },
  ];

  const hasAnyActivity = completed > 0 || nutritionAdherencePct > 0 || thisWeekWeights.length > 0;
  const strongestArea: ReportArea = hasAnyActivity
    ? scores.reduce((a, b) => (b.score > a.score ? b : a)).area
    : 'none';
  const weakestArea: ReportArea = hasAnyActivity
    ? scores.reduce((a, b) => (b.score < a.score ? b : a)).area
    : 'none';

  const report = generateWeeklyReport({
    workoutsCompleted: completed,
    workoutsPlanned: planned,
    nutritionAdherencePct,
    recoveryAveragePct,
    weightDeltaKg,
    strongestArea,
    weakestArea,
  });

  const ROWS: ReportRow[] = [
    {
      icon: 'checkPlain',
      color: '#3DDC84',
      label: 'Workouts',
      value: `${report.workoutsCompleted} / ${report.workoutsPlanned}`,
      secondary: 'Completed',
    },
    {
      icon: 'nutrition',
      color: '#3DDC84',
      label: 'Nutrition',
      value: `${report.nutritionAdherencePct}%`,
      secondary: 'Adherence',
    },
    {
      icon: 'clock',
      color: '#F5A623',
      label: 'Recovery',
      value: report.recoveryLabel,
      secondary: `Average ${report.recoveryAveragePct}%`,
    },
    {
      icon: 'heart',
      color: '#E0272E',
      label: 'Weight',
      value: thisWeekWeights.length > 0 ? `${report.weightDeltaKg > 0 ? '+' : ''}${report.weightDeltaKg} kg` : 'No data',
      secondary: 'vs last week',
    },
  ];

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
          {report.headline} <span>🔥</span>
        </h2>
        <p className="text-text-secondary text-[13.5px] mt-1.5 leading-relaxed">{report.subtext}</p>
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
          <p className="text-text-secondary text-[13.5px] mt-2 leading-relaxed">{report.coachFeedback}</p>
        </div>
      </div>

      <div className="px-4 mt-4">
        <Link
          to="/todays-workout"
          className="block w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button text-center"
        >
          VIEW NEXT WEEK PLAN
        </Link>
      </div>
    </Screen>
  );
}
