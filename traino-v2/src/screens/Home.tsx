import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { BottomNav } from '../components/ui/BottomNav';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import { useWeeklyCoaching } from '../domain/state/WeeklyCoachingContext';
import { useDailyReadiness } from '../domain/state/DailyReadinessContext';
import { useTrainingContext } from '../domain/state/TrainingContextStore';
import { composeContextualWorkout } from '../domain/context/composeContextualWorkout';
import type { AthleteConstraints } from '../domain/exercise/matchingEngine';
import { computeProgressionInfo } from '../domain/engine/progressionEngine';
import {
  computePerformanceStats,
  computeWorkoutCompletion,
  computeNutritionAdherence,
  computeRecoveryScore,
} from '../domain/engine/progressEngine';
import { barrierDisplayName } from '../domain/coaching/barriers';
import { READINESS_STATUS_COLOR, READINESS_STATUS_LABEL } from '../domain/readiness/scales';
import { SPORTS } from '../domain/sports/sports';

function trendToPoints(trend: number[], width = 60, height = 20): string {
  const max = Math.max(...trend, 1);
  const min = Math.min(...trend, 0);
  const range = max - min || 1;
  const step = trend.length > 1 ? width / (trend.length - 1) : 0;
  return trend
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function ProgressRing({ percent, color }: { percent: number; color: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90">
      <circle cx="19" cy="19" r={r} stroke="#242428" strokeWidth="3.5" fill="none" />
      <circle
        cx="19"
        cy="19"
        r={r}
        stroke={color}
        strokeWidth="3.5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatTile({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="bg-card rounded-card-sm border border-border-soft px-2 py-2.5 flex-1 min-w-0">
      <div className="text-text-secondary text-[9px] tracking-tight font-medium mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </div>
      {children}
    </div>
  );
}

export default function Home() {
  const { profile, planStartDate } = useProfile();
  const { getRecentLogs, getLogsSince } = useLogs();
  const { getRecord, getApprovedAdjustmentForWeek } = useWeeklyCoaching();
  const { getTodayRecord } = useDailyReadiness();
  const { getResolvedContext } = useTrainingContext();
  const { today } = useLogs();
  const progressionLogs = planStartDate ? getLogsSince(planStartDate) : [];
  const { progressionWeek, currentPlanWeek } = computeProgressionInfo(
    planStartDate,
    progressionLogs,
    profile.answers.daysAvailablePerWeek
  );
  const readinessRecord = getTodayRecord();
  const readinessAdjustment = readinessRecord?.recommendationApplied
    ? (readinessRecord.recommendation.trainingAdjustment ?? null)
    : null;
  const weeklyAdjustment = getApprovedAdjustmentForWeek(currentPlanWeek)?.decision?.proposedChanges?.trainingAdjustment ?? null;
  const resolvedContext = getResolvedContext(today);
  const athleteConstraints: AthleteConstraints = {
    availableEquipment: profile.answers.equipmentIds,
    injuryIds: profile.answers.injuryIds,
    sport: profile.answers.sport,
    athleteLevel: profile.level,
  };
  const { skipNormalSession, contextMessage, workout: composedWorkout } = composeContextualWorkout({
    profile,
    weekNumber: progressionWeek,
    activeAdjustment: null,
    readinessAdjustment,
    weeklyAdjustment,
    resolvedContext,
    athleteConstraints,
  });
  const workout = composedWorkout;
  const sportName = SPORTS.find((s) => s.id === profile.answers.sport)?.name ?? 'Training';

  const last7 = getRecentLogs(7);
  const { completed: workoutsCompleted } = computeWorkoutCompletion(last7);
  const workoutsPlanned = Math.max(profile.answers.daysAvailablePerWeek, 1);
  const consistencyPct = Math.round((workoutsCompleted / workoutsPlanned) * 100);
  const coachingRecord = getRecord(currentPlanWeek);
  const nutritionPct = computeNutritionAdherence(last7);
  const recoveryPct = computeRecoveryScore(last7, profile.answers.daysAvailablePerWeek);

  const perfStats = computePerformanceStats(last7);
  const leadCategory = (['strength', 'speed', 'stamina'] as const).reduce((best, cat) =>
    perfStats[cat].hasData && Math.abs(perfStats[cat].changePct) > Math.abs(perfStats[best].changePct) ? cat : best
  );
  const leadStat = perfStats[leadCategory];
  const hasAnyWorkoutHistory = last7.some((d) => d.workoutCompleted);

  return (
    <Screen>
      <StatusBar />

      <div className="px-5 pt-3 flex items-start justify-between">
        <div>
          <p className="text-text-secondary text-[15px]">Good morning,</p>
          <p className="text-white text-[26px] font-extrabold leading-tight">
            {profile.answers.firstName || 'Athlete'} <span className="align-middle">👋</span>
          </p>
        </div>
        <button className="relative w-10 h-10 rounded-full bg-card border border-border-soft flex items-center justify-center shrink-0 mt-1">
          <Icon name="notification" size={19} className="text-white" />
          <span className="absolute -top-1 -right-1 bg-red text-white text-[10px] font-bold w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full flex items-center justify-center">
            3
          </span>
        </button>
      </div>

      {(resolvedContext.mode === 'travel' || contextMessage) && (
        <Link
          to="/travel-competition"
          className="mx-5 mt-4 flex items-center gap-2.5 bg-card border border-border-soft rounded-card-sm px-3.5 py-2.5"
        >
          <Icon name={resolvedContext.mode === 'competition' ? 'calendar' : 'suitcase'} size={15} className="text-red shrink-0" />
          <p className="flex-1 text-text-secondary text-[12px] font-semibold">
            {contextMessage ?? 'Travel Mode active'}
          </p>
          <Icon name="chevronRight" size={14} className="text-text-muted shrink-0" />
        </Link>
      )}

      <div className="px-5 mt-5">
        <p className="text-text-secondary text-[11px] font-bold tracking-wider uppercase mb-2">
          Today's Plan
        </p>

        <div className="relative rounded-card border-2 border-red overflow-hidden bg-card">
          <div className="relative h-[205px]">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 78% 30%, rgba(224,39,46,0.18), transparent 55%), linear-gradient(135deg, #17171b 0%, #0c0c0f 60%, #050506 100%)',
              }}
            />
            {/*
              Replaceable slot: pass src={heroWorkoutPhotoUrl} once a real
              licensed TRAINO athlete photo exists — position/crop/size
              stay exactly as matched against the reference, nothing else
              needs to change.
            */}
            <AssetSlot
              className="absolute right-[-10px] bottom-0 top-6 w-[62%] opacity-90"
              fit="contain"
              position="bottom right"
              label="Athlete photo"
              placeholderIcon={
                <svg viewBox="0 0 200 230" className="w-full h-full" preserveAspectRatio="xMidYMax meet">
                  <ellipse cx="100" cy="225" rx="70" ry="8" fill="black" opacity="0.35" />
                  <g fill="#2a2a2e">
                    <circle cx="118" cy="46" r="17" />
                    <path d="M85 92c6-20 20-30 36-30s28 9 33 27l8 55c2 10-4 19-14 20l-10 1-4 40-14 1-3-45-16 2-6 44-14-1 4-46c-9-3-14-12-11-22Z" />
                  </g>
                </svg>
              }
            />
            <div className="absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-card via-transparent to-transparent" />
            <div className="absolute left-4 top-4 right-4">
              <p className="text-text-secondary text-[11px] font-bold tracking-wider uppercase">
                {sportName} Performance
              </p>
              <p className="text-white text-[26px] font-extrabold leading-[1.15] mt-1">
                {skipNormalSession || !workout ? (
                  'Competition Day'
                ) : workout.name.includes(' + ') ? (
                  <>
                    {workout.name.split(' + ')[0]} +<br />
                    {workout.name.split(' + ').slice(1).join(' + ')}
                  </>
                ) : (
                  workout.name
                )}
              </p>
              {workout && !skipNormalSession && (
                <div className="flex items-center gap-3 mt-3 text-white text-[13px] font-medium">
                  <span className="flex items-center gap-1.5">
                    <Icon name="clock" size={15} />
                    {workout.durationMin} min
                  </span>
                  <span className="text-border">|</span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="target" size={15} />
                    {workout.intensity}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="p-3">
            <button className="w-full bg-red hover:bg-red-dim transition-colors rounded-button py-3.5 flex items-center justify-center gap-2 shadow-button">
              <span className="text-white font-extrabold text-[15px] tracking-wide">START WORKOUT</span>
              <Icon name="playTriangle" size={14} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 mt-3.5">
        <Link
          to="/daily-check-in"
          className="flex items-center gap-3 bg-card rounded-card-sm border border-border-soft px-4 py-3"
        >
          <span className="w-9 h-9 min-w-[36px] rounded-[10px] bg-card-nested flex items-center justify-center shrink-0">
            <Icon name="battery" size={16} className="text-white" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-text-secondary text-[11px] font-bold tracking-wider uppercase">
              Today's Readiness
            </span>
            {readinessRecord ? (
              <span className="block text-white text-[13px] mt-0.5">
                <span className="font-extrabold">{readinessRecord.score}%</span>{' '}
                <span className={`font-semibold ${READINESS_STATUS_COLOR[readinessRecord.status]}`}>
                  {READINESS_STATUS_LABEL[readinessRecord.status]}
                </span>
              </span>
            ) : (
              <span className="block text-text-secondary text-[13px] mt-0.5">Not checked in yet</span>
            )}
          </span>
          <span className="text-red text-[12.5px] font-bold shrink-0">
            {readinessRecord ? 'View' : 'Check in'}
          </span>
        </Link>
      </div>

      <div className="px-5 mt-5 flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-[11px] font-bold tracking-wider uppercase">
            Your Progress
          </p>
          <p className="text-text-secondary text-[13px] mt-0.5">This Week</p>
        </div>
        <button className="text-red text-[13px] font-semibold">View all</button>
      </div>

      <div className="px-5 mt-3 flex gap-2">
        <StatTile label="Workouts">
          <p className="text-white text-[20px] font-extrabold leading-none">
            {workoutsCompleted}
            <span className="text-text-muted text-[13px] font-medium">/{workoutsPlanned}</span>
          </p>
        </StatTile>
        <StatTile label="Performance">
          <p className="text-white text-[20px] font-extrabold leading-none mb-1">
            {leadStat.hasData ? `${Math.abs(leadStat.changePct)}%` : '—'}
          </p>
          <svg viewBox="0 0 60 20" className="w-full h-4">
            <polyline
              points={trendToPoints(leadStat.trend)}
              fill="none"
              stroke="#E0272E"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </StatTile>
        <StatTile label="Nutrition">
          <p className="text-white text-[20px] font-extrabold leading-none mb-1">{nutritionPct}%</p>
          <div className="relative w-[38px] h-[38px]">
            <ProgressRing percent={nutritionPct} color="#3DDC84" />
            <Icon
              name="nutrition"
              size={13}
              className="text-success absolute inset-0 m-auto"
            />
          </div>
        </StatTile>
        <StatTile label="Recovery">
          <p className="text-white text-[20px] font-extrabold leading-none mb-1">{recoveryPct}%</p>
          <div className="relative w-[38px] h-[38px]">
            <ProgressRing percent={recoveryPct} color="#4A9EFF" />
            <Icon name="heart" size={13} className="text-info absolute inset-0 m-auto" />
          </div>
        </StatTile>
      </div>

      {coachingRecord?.decision && (
        <div className="px-5 mt-3.5">
          <Link to="/weekly-report" className="block bg-card rounded-card border border-border-soft p-3.5">
            <p className="text-text-secondary text-[11px] font-bold tracking-wider uppercase mb-1.5">
              Weekly Coaching
            </p>
            <p className="text-white text-[13px] leading-relaxed">
              Your consistency: <span className="font-bold">{consistencyPct}%</span>
            </p>
            {coachingRecord.decision.barrier && (
              <p className="text-white text-[13px] leading-relaxed mt-0.5">
                Main barrier: <span className="font-bold">{barrierDisplayName(coachingRecord.decision.barrier)}</span>
              </p>
            )}
            <p className="text-red text-[13px] font-bold mt-2">
              {coachingRecord.approvalStatus === 'pending'
                ? "TRAINO has a recommendation for next week"
                : 'View Weekly Review'}
            </p>
          </Link>
        </div>
      )}

      <div className="px-5 mt-3.5">
        <div className="bg-card rounded-card border border-border-soft p-3.5 relative overflow-hidden">
          <p className="text-text-secondary text-[11px] font-bold tracking-wider uppercase mb-1.5">
            AI Coach
          </p>
          <p className="text-white text-[13px] leading-relaxed max-w-[65%]">
            {hasAnyWorkoutHistory
              ? "Your recovery looks good today. I've prepared your next session for optimal performance."
              : "Let's get your first session logged — I'll adjust your plan as your history builds up."}
          </p>
          <button className="text-red text-[13px] font-bold mt-2.5">Chat with AI</button>
          <div className="absolute right-4 bottom-3 text-red drop-shadow-[0_0_8px_rgba(224,39,46,0.5)]">
            <Icon name="aiMascot" size={50} strokeWidth={1.6} />
          </div>
        </div>
      </div>

      <BottomNav />
    </Screen>
  );
}
