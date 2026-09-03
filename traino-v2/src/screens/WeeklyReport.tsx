import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon, type IconName } from '../components/ui/Icon';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import { useWeeklyCoaching } from '../domain/state/WeeklyCoachingContext';
import { useTrainingContext } from '../domain/state/TrainingContextStore';
import { useDailyReadiness } from '../domain/state/DailyReadinessContext';
import { computeProgressionInfo } from '../domain/engine/progressionEngine';
import { computeWeekSummary } from '../domain/engine/barrierEngine';
import { describeWeekContextInfluence, computeContextAdjustedPlannedSessions } from '../domain/context/weeklyCoachingIntegration';
import { computePerformanceStats } from '../domain/engine/progressEngine';
import { generateWeeklyReport, AREA_PRAISE, type ReportArea } from '../domain/engine/weeklyReportEngine';
import { barrierDisplayName } from '../domain/coaching/barriers';
import { buildPerformanceSummary } from '../domain/performance/performanceEngine';

interface ReportRow {
  icon: IconName;
  color: string;
  label: string;
  value: string;
  secondary: string;
}

export default function WeeklyReport() {
  const { profile, planStartDate } = useProfile();
  const { answers } = profile;
  const { today, getRecentLogs, getLogsSince, getAllLoggedExerciseNames, getExerciseHistory } = useLogs();
  const { getRecord, approve, reject } = useWeeklyCoaching();
  const { travelContexts, competitionEvents } = useTrainingContext();
  const { getRecordsInRange } = useDailyReadiness();
  const navigate = useNavigate();

  const last7 = getRecentLogs(7);
  const last14 = getRecentLogs(14);
  const prior7 = last14.slice(0, 7);
  const contextNote = describeWeekContextInfluence(last7.map((d) => d.date), travelContexts, competitionEvents);

  const progressionLogs = planStartDate ? getLogsSince(planStartDate) : [];
  const { currentPlanWeek } = computeProgressionInfo(planStartDate, progressionLogs, answers.daysAvailablePerWeek);
  const record = getRecord(currentPlanWeek);

  // Single analytical source of truth for this week's numbers (spec §25):
  // the SAME context-adjusted planned-session count and real readiness
  // history the Weekly Coaching Loop's own decision already uses, via the
  // SAME `computeWeekSummary` composer — never a second, independently
  // recomputed "planned" count that could silently disagree with it (a
  // travel/competition-adjusted week previously showed its RAW weekly
  // cadence here while the coaching decision below correctly used the
  // context-adjusted one).
  const contextAdjustedPlanned = computeContextAdjustedPlannedSessions(
    answers.daysAvailablePerWeek,
    last7.map((d) => d.date),
    travelContexts,
    competitionEvents
  );
  const currentWeekReadiness = last7.length > 0 ? getRecordsInRange(last7[0].date, last7[last7.length - 1].date) : [];
  const weekSummary = computeWeekSummary(last7, prior7, contextAdjustedPlanned, currentWeekReadiness);

  const completed = weekSummary.workoutsCompleted;
  const planned = Math.max(weekSummary.workoutsPlanned, 1);
  const nutritionAdherencePct = weekSummary.nutritionAdherencePct;
  const recoveryAveragePct = weekSummary.recoveryScore;
  const weightDeltaKg = weekSummary.weightDeltaKg;
  const hasWeightData = weekSummary.hasWeightData;

  const stats = computePerformanceStats(last7);

  // The real Performance Analytics layer (spec: "ADVANCED PROGRESS &
  // PERFORMANCE") — the same engine Progress/AI Coach read from, so Weekly
  // Report's milestones/goal-progress line is never a second, conflicting
  // calculation of "progress".
  const performanceSummary = buildPerformanceSummary({
    today,
    goal: answers.goal,
    sportId: answers.sport,
    plannedPerWeek: answers.daysAvailablePerWeek,
    weightFallbackKg: answers.weightKg,
    nutritionTargets: profile.nutrition,
    exerciseNames: getAllLoggedExerciseNames(),
    getExerciseHistory,
    recentLogs30: getRecentLogs(30),
    readinessRecords30: getRecordsInRange(getRecentLogs(30)[0]?.date ?? today, today),
    travelContexts,
    competitionEvents,
  });
  const scores: { area: ReportArea; score: number }[] = [
    { area: 'speed', score: stats.speed.hasData ? 50 + Math.max(-50, Math.min(50, stats.speed.changePct)) : 20 },
    { area: 'strength', score: stats.strength.hasData ? 50 + Math.max(-50, Math.min(50, stats.strength.changePct)) : 20 },
    { area: 'stamina', score: stats.stamina.hasData ? 50 + Math.max(-50, Math.min(50, stats.stamina.changePct)) : 20 },
    { area: 'nutrition', score: nutritionAdherencePct },
    { area: 'recovery', score: recoveryAveragePct },
  ];

  const hasAnyActivity = completed > 0 || nutritionAdherencePct > 0 || hasWeightData;
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
    { icon: 'checkPlain', color: '#3DDC84', label: 'Workouts', value: `${report.workoutsCompleted} / ${report.workoutsPlanned}`, secondary: 'Completed' },
    { icon: 'nutrition', color: '#3DDC84', label: 'Nutrition', value: `${report.nutritionAdherencePct}%`, secondary: 'Adherence' },
    { icon: 'clock', color: '#F5A623', label: 'Recovery', value: report.recoveryLabel, secondary: `Average ${report.recoveryAveragePct}%` },
    { icon: 'heart', color: '#E0272E', label: 'Weight', value: hasWeightData ? `${report.weightDeltaKg > 0 ? '+' : ''}${report.weightDeltaKg} kg` : 'No data', secondary: 'vs last week' },
  ];

  const decision = record?.decision ?? null;
  const barrierName = barrierDisplayName(decision?.barrier ?? null);

  function handleApprove() {
    approve(currentPlanWeek);
  }
  function handleReject() {
    reject(currentPlanWeek);
  }

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
        <p className="text-text-secondary text-[11px] font-bold tracking-wider uppercase mb-1.5">Your Week</p>
        <h2 className="text-white text-[22px] font-extrabold leading-snug">
          {report.headline} <span>🔥</span>
        </h2>
        <p className="text-text-secondary text-[13.5px] mt-1.5 leading-relaxed">{report.subtext}</p>
      </div>

      <div className="px-4 mt-4">
        <div className="bg-card border border-border-soft rounded-card px-4">
          {ROWS.map((row, i) => (
            <div key={row.label} className={`flex items-center gap-3 py-3.5 ${i < ROWS.length - 1 ? 'border-b border-border-soft' : ''}`}>
              <span className="w-8 h-8 min-w-[32px] rounded-full flex items-center justify-center" style={{ backgroundColor: `${row.color}26` }}>
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

      {!record ? (
        <div className="px-4 mt-4">
          <div className="bg-card border border-border-soft rounded-card p-4 flex items-center gap-3">
            <span className="w-10 h-10 min-w-[40px] rounded-full bg-red/15 flex items-center justify-center shrink-0">
              <Icon name="aiMascot" size={19} className="text-red" strokeWidth={1.8} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13.5px] font-bold">Tell TRAINO about your week</p>
              <p className="text-text-secondary text-[12.5px] mt-0.5">A quick check-in helps shape next week's plan.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/weekly-check-in')}
            className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button mt-3"
          >
            WEEKLY CHECK-IN
          </button>
        </div>
      ) : (
        <>
          <div className="px-4 mt-4">
            <div className="bg-card border border-border-soft rounded-card p-4">
              <p className="text-white text-[11px] font-extrabold tracking-wide">WHAT WENT WELL</p>
              <p className="text-text-secondary text-[13px] mt-2 leading-relaxed">{AREA_PRAISE[strongestArea]}.</p>
            </div>
          </div>

          <div className="px-4 mt-3">
            <div className="bg-card border border-border-soft rounded-card p-4">
              <p className="text-white text-[11px] font-extrabold tracking-wide">WHAT HELD YOU BACK</p>
              <p className="text-text-secondary text-[13px] mt-2 leading-relaxed">
                {decision?.barrier ? `${barrierName}${decision.isRecurring ? ' — recurring' : ''}` : 'Nothing held you back this week.'}
              </p>
              {decision?.isRecurring && (
                <p className="text-red text-[12px] font-semibold mt-1.5">
                  This has been a barrier for {decision.recurringWeeks} weeks in a row.
                </p>
              )}
            </div>
          </div>

          {decision?.barrier && (
            <div className="px-4 mt-3">
              <div className="bg-card border border-border-soft rounded-card p-4">
                <p className="text-white text-[11px] font-extrabold tracking-wide">WHY</p>
                <p className="text-text-secondary text-[13px] mt-2 leading-relaxed">{decision.evidence}.</p>
              </div>
            </div>
          )}

          {record.readinessNote && (
            <div className="px-4 mt-3">
              <div className="bg-card border border-border-soft rounded-card p-4 flex items-start gap-2.5">
                <Icon name="battery" size={15} className="text-red shrink-0 mt-0.5" />
                <p className="text-text-secondary text-[13px] leading-relaxed">{record.readinessNote}</p>
              </div>
            </div>
          )}

          {contextNote && (
            <div className="px-4 mt-3">
              <div className="bg-card border border-border-soft rounded-card p-4 flex items-start gap-2.5">
                <Icon name="suitcase" size={15} className="text-red shrink-0 mt-0.5" />
                <p className="text-text-secondary text-[13px] leading-relaxed">{contextNote}</p>
              </div>
            </div>
          )}

          {(performanceSummary.goalProgress.overallScore !== null || performanceSummary.milestones.length > 0) && (
            <div className="px-4 mt-3">
              <div className="bg-card border border-border-soft rounded-card p-4">
                <p className="text-white text-[11px] font-extrabold tracking-wide">GOAL PROGRESS</p>
                {performanceSummary.goalProgress.overallScore !== null && (
                  <p className="text-text-secondary text-[13px] mt-2">
                    You're at {performanceSummary.goalProgress.overallScore}% toward your goal this week.
                  </p>
                )}
                {performanceSummary.milestones.slice(0, 2).map((m, i) => (
                  <p key={`${m.type}-${i}`} className="text-text-secondary text-[12.5px] mt-1.5 flex items-start gap-1.5">
                    <Icon name="trophy" size={13} className="text-red shrink-0 mt-0.5" />
                    {m.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="px-4 mt-3">
            <div className="bg-card border border-red/40 rounded-card p-4">
              <p className="text-white text-[11px] font-extrabold tracking-wide">TRAINO'S RECOMMENDATION</p>
              <p className="text-text-secondary text-[13px] mt-2 leading-relaxed">{decision?.reason}</p>

              {decision?.proposedChanges && (
                <p className="text-white text-[13px] font-bold mt-2">{decision.proposedChanges.summary}</p>
              )}

              {decision?.requiresApproval && record.approvalStatus === 'pending' && (
                <div className="flex gap-2.5 mt-4">
                  <button
                    onClick={handleApprove}
                    className="flex-1 bg-red rounded-button py-3 text-white font-extrabold text-[13px] tracking-wide shadow-button"
                  >
                    APPLY TO NEXT WEEK
                  </button>
                  <button
                    onClick={handleReject}
                    className="flex-1 border border-border-soft rounded-button py-3 text-text-secondary font-extrabold text-[13px] tracking-wide"
                  >
                    KEEP CURRENT PLAN
                  </button>
                </div>
              )}

              {decision?.requiresApproval && record.approvalStatus === 'approved' && (
                <p className="text-success text-[12.5px] font-semibold mt-3 flex items-center gap-1.5">
                  <Icon name="checkPlain" size={12} strokeWidth={2.8} /> Applied to next week
                </p>
              )}
              {decision?.requiresApproval && record.approvalStatus === 'rejected' && (
                <p className="text-text-muted text-[12.5px] font-semibold mt-3">Kept your current plan</p>
              )}
            </div>
          </div>

          <div className="px-4 mt-3">
            <div className="bg-card-nested border border-border-soft rounded-card p-4">
              <p className="text-white text-[11px] font-extrabold tracking-wide">NEXT WEEK</p>
              <p className="text-text-secondary text-[13px] mt-2 leading-relaxed">
                {record.approvalStatus === 'approved' && decision?.proposedChanges
                  ? decision.proposedChanges.summary
                  : record.approvalStatus === 'pending'
                    ? 'Waiting on your decision above.'
                    : 'Same plan continues.'}
              </p>
            </div>
          </div>
        </>
      )}

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
