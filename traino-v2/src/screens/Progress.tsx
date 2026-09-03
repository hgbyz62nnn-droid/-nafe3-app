import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { BottomNav } from '../components/ui/BottomNav';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import { useDailyReadiness } from '../domain/state/DailyReadinessContext';
import { useTrainingContext } from '../domain/state/TrainingContextStore';
import {
  computeExerciseTrend,
  computePerformanceStats,
  computeWeightTrend,
  type ExerciseTrendResult,
  type PerformanceCategory,
} from '../domain/engine/progressEngine';
import { buildPerformanceSummary } from '../domain/performance/performanceEngine';
import type { PersonalRecord, TrendState } from '../domain/performance/types';
import { addDays, localDateKey } from '../domain/engine/dateUtils';

const PERF_TREND_META: Record<TrendState, { label: string; color: string }> = {
  improving: { label: 'Improving', color: 'text-success' },
  declining: { label: 'Declining', color: 'text-red' },
  stable: { label: 'Stable', color: 'text-text-secondary' },
  insufficient_data: { label: 'Building history', color: 'text-text-muted' },
};

const TREND_META: Record<ExerciseTrendResult['trend'], { label: string; color: string }> = {
  improving: { label: 'Improving', color: 'text-success' },
  declining: { label: 'Declining', color: 'text-red' },
  steady: { label: 'Steady', color: 'text-text-secondary' },
  not_enough_data: { label: 'Building history', color: 'text-text-muted' },
};

const TABS = ['Overview', 'Training', 'Nutrition', 'Body'];

const PERF_META: { category: PerformanceCategory; label: string; color: string }[] = [
  { category: 'speed', label: 'Speed', color: '#F5A623' },
  { category: 'stamina', label: 'Stamina', color: '#E0272E' },
  { category: 'strength', label: 'Strength', color: '#3DDC84' },
];

function Sparkline({ points, color, width = 92, height = 46 }: { points: number[]; color: string; width?: number; height?: number }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / range) * (height - 6) - 3;
    return [x, y];
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3 : 2} fill={color} />
      ))}
    </svg>
  );
}

function WeightChart({ points, height = 100 }: { points: number[]; height?: number }) {
  const vw = 100;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const margin = 3;
  const step = (vw - margin * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = margin + i * step;
    const y = height - ((p - min) / range) * (height - 10) - 5;
    return [x, y];
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L${vw},${height} L0,${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${vw} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="weightFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3DDC84" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#3DDC84" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#weightFade)" />
      <path
        d={path}
        stroke="#3DDC84"
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.6} fill="#0A0A0D" stroke="#3DDC84" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export default function Progress() {
  const [tab, setTab] = useState('Overview');
  const [isLoggingWeight, setIsLoggingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  const { answers, profile } = useProfile();
  const { today, getRecentLogs, logWeight, getAllLoggedExerciseNames, getExerciseHistory } = useLogs();
  const { getRecordsInRange } = useDailyReadiness();
  const { travelContexts, competitionEvents } = useTrainingContext();
  const recentLogs = getRecentLogs(30);

  const exerciseTrends = getAllLoggedExerciseNames()
    .map((name) => computeExerciseTrend(name, getExerciseHistory(name)))
    .filter((t): t is ExerciseTrendResult => t !== null);

  const stats = computePerformanceStats(recentLogs);
  const weightTrend = computeWeightTrend(recentLogs, answers.weightKg);
  const weightEntries = recentLogs.filter((d) => typeof d.weightKg === 'number');
  const currentWeight = weightTrend.hasData ? weightTrend.points[weightTrend.points.length - 1] : answers.weightKg;

  // Real Performance Analytics (spec: "ADVANCED PROGRESS & PERFORMANCE") —
  // one analytical layer, derived read-only from the same persisted logs
  // this screen already fetches above, plus readiness/context history.
  const readinessRecords30 = getRecordsInRange(localDateKey(addDays(new Date(), -29)), today);
  const summary = buildPerformanceSummary({
    today,
    goal: answers.goal,
    sportId: answers.sport,
    plannedPerWeek: answers.daysAvailablePerWeek,
    weightFallbackKg: answers.weightKg,
    nutritionTargets: profile.nutrition,
    exerciseNames: getAllLoggedExerciseNames(),
    getExerciseHistory,
    recentLogs30: recentLogs,
    readinessRecords30,
    travelContexts,
    competitionEvents,
  });

  const allPersonalRecords: PersonalRecord[] = summary.exercises.flatMap((e) => e.personalRecords.filter((r) => r.isRecent));

  function submitWeight() {
    const value = parseFloat(weightInput);
    if (!Number.isNaN(value) && value > 0) {
      logWeight(today, value);
    }
    setWeightInput('');
    setIsLoggingWeight(false);
  }

  return (
    <Screen>
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          PROGRESS
        </h1>
        <Icon name="calendar" size={19} className="text-white shrink-0" />
      </div>

      <div className="flex items-center gap-5 px-4 mt-4 border-b border-border-soft">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2.5 text-[13.5px] font-bold relative ${
              tab === t ? 'text-red' : 'text-text-muted'
            }`}
          >
            {t}
            {tab === t && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-red rounded-full" />}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4">
        <div className="bg-card border border-border-soft rounded-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="target" size={16} className="text-red" strokeWidth={2} />
              <p className="text-white text-[13px] font-bold">Goal Progress</p>
            </div>
            <p className="text-white text-[15px] font-extrabold">
              {summary.goalProgress.overallScore !== null ? `${summary.goalProgress.overallScore}%` : '—'}
            </p>
          </div>
          {summary.goalProgress.overallScore !== null ? (
            <div className="mt-2.5 flex flex-col gap-1.5">
              {summary.goalProgress.components
                .filter((c) => c.score !== null)
                .map((c) => (
                  <div key={c.label} className="flex items-center justify-between">
                    <span className="text-text-secondary text-[11.5px]">{c.label}</span>
                    <span className="text-text-secondary text-[11.5px] font-semibold">{c.score}%</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-text-muted text-[12px] mt-1.5">Log a few workouts, meals, or weigh-ins to see your goal progress.</p>
          )}
        </div>
      </div>

      {summary.milestones.length > 0 && (
        <div className="px-4 mt-3">
          <div className="bg-card border border-border-soft rounded-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="trophy" size={15} className="text-red" strokeWidth={2} />
              <p className="text-white text-[12px] font-extrabold tracking-wide">RECENT MILESTONES</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {summary.milestones.slice(0, 4).map((m, i) => (
                <p key={`${m.type}-${m.exerciseName ?? ''}-${i}`} className="text-text-secondary text-[12px]">
                  {m.message}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'Overview' && (
        <div className="px-4 mt-3">
          <div className="bg-card border border-border-soft rounded-card p-4">
            <p className="text-white text-[12px] font-extrabold tracking-wide mb-2">THIS WEEK VS LAST WEEK</p>
            <div className="flex flex-col gap-2">
              {summary.weekComparison.metrics.map((m) => (
                <div key={m.label} className="flex items-center justify-between">
                  <span className="text-text-secondary text-[12.5px]">{m.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white text-[12.5px] font-semibold">{m.thisWeek !== null ? m.thisWeek : '—'}</span>
                    {m.direction === 'up' && <span className="text-success text-[12px] font-bold">↑</span>}
                    {m.direction === 'down' && <span className="text-red text-[12px] font-bold">↓</span>}
                    {m.direction === 'unchanged' && <span className="text-text-muted text-[12px]">—</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 mt-4">
        <p className="text-text-secondary text-[12px] font-bold tracking-wide">PERFORMANCE</p>
        <p className="text-text-secondary text-[12px]">Last 30 Days</p>
      </div>

      <div className="px-4 mt-2 grid grid-cols-3 gap-2">
        {PERF_META.map((meta) => {
          const stat = stats[meta.category];
          const sign = stat.changePct > 0 ? '↑' : stat.changePct < 0 ? '↓' : '';
          return (
            <div key={meta.category} className="bg-card border border-border-soft rounded-card-sm p-2.5">
              <p className="text-text-secondary text-[11px] font-semibold">{meta.label}</p>
              <div className="mt-1">
                <Sparkline points={stat.trend} color={meta.color} />
              </div>
              {stat.hasData ? (
                <p className="text-[12px] font-extrabold mt-1" style={{ color: meta.color }}>
                  {sign} {Math.abs(stat.changePct)}%
                </p>
              ) : (
                <p className="text-text-muted text-[10.5px] font-semibold mt-1">No sessions yet</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-4 mt-5">
        <p className="text-text-secondary text-[12px] font-bold tracking-wide">WEIGHT</p>
        {weightTrend.hasData && weightTrend.deltaKg !== 0 && (
          <p className={`text-[12.5px] font-bold ${weightTrend.deltaKg < 0 ? 'text-success' : 'text-red'}`}>
            {weightTrend.deltaKg < 0 ? '↓' : '↑'} {Math.abs(weightTrend.deltaKg)} kg
          </p>
        )}
      </div>

      <div className="px-4 mt-2">
        <div className="bg-card border border-border-soft rounded-card p-4">
          <div className="flex items-start justify-between">
            <p className="text-white text-[24px] font-extrabold">{currentWeight} kg</p>
            <button onClick={() => setIsLoggingWeight((v) => !v)} aria-label="Log weight">
              <Icon name="plus" size={16} className="text-text-muted mt-1" />
            </button>
          </div>

          {isLoggingWeight && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                inputMode="decimal"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="Weight in kg"
                className="flex-1 bg-card-nested border border-border-soft rounded-card-sm px-3 py-2 text-white text-[13px] outline-none focus:border-red"
              />
              <button
                onClick={submitWeight}
                className="bg-red rounded-card-sm px-3.5 py-2 text-white text-[12.5px] font-bold"
              >
                Save
              </button>
            </div>
          )}

          <div className="mt-2">
            <WeightChart points={weightTrend.points} />
          </div>

          {weightTrend.hasData ? (
            <div className="flex items-center justify-between mt-1">
              <span className="text-text-muted text-[11px]">{formatShortDate(weightEntries[0].date)}</span>
              {weightEntries.length > 2 && (
                <span className="text-text-muted text-[11px]">
                  {formatShortDate(weightEntries[Math.floor(weightEntries.length / 2)].date)}
                </span>
              )}
              <span className="text-text-muted text-[11px]">
                {formatShortDate(weightEntries[weightEntries.length - 1].date)}
              </span>
            </div>
          ) : (
            <p className="text-text-muted text-[11px] mt-1.5 text-center">Log your weight to start a trend</p>
          )}
        </div>
      </div>

      {tab === 'Training' && (
        <div className="px-4 mt-5">
          <p className="text-text-secondary text-[12px] font-bold tracking-wide mb-2">TRAINING CONSISTENCY</p>
          {summary.trainingConsistency.hasData ? (
            <div className="bg-card border border-border-soft rounded-card p-4 mb-4">
              <div className="flex items-center justify-between">
                <p className="text-white text-[20px] font-extrabold">
                  {summary.trainingConsistency.completedSessions} / {summary.trainingConsistency.plannedSessions}
                </p>
                <p className="text-text-secondary text-[12.5px] font-semibold">{summary.trainingConsistency.completionPct}%</p>
              </div>
              {(summary.trainingConsistency.travelAdjustedSessions > 0 ||
                summary.trainingConsistency.intentionallySkippedCompetitionSessions > 0) && (
                <p className="text-text-muted text-[11.5px] mt-1.5">
                  {summary.trainingConsistency.travelAdjustedSessions > 0 &&
                    `${summary.trainingConsistency.travelAdjustedSessions} adjusted while traveling. `}
                  {summary.trainingConsistency.intentionallySkippedCompetitionSessions > 0 &&
                    `${summary.trainingConsistency.intentionallySkippedCompetitionSessions} intentionally reduced around competition.`}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border-soft rounded-card p-4 mb-4">
              <p className="text-text-muted text-[12.5px] text-center">Complete a few workouts to see your training consistency.</p>
            </div>
          )}

          {allPersonalRecords.length > 0 && (
            <>
              <p className="text-text-secondary text-[12px] font-bold tracking-wide mb-2">PERSONAL RECORDS</p>
              <div className="flex flex-col gap-2 mb-4">
                {allPersonalRecords.map((pr) => (
                  <div key={`${pr.exerciseName}-${pr.bracketLabel}`} className="bg-card border border-border-soft rounded-card-sm p-3 flex items-center gap-2.5">
                    <Icon name="trophy" size={15} className="text-red shrink-0" strokeWidth={2} />
                    <div className="min-w-0">
                      <p className="text-white text-[12.5px] font-bold truncate">{pr.exerciseName}</p>
                      <p className="text-text-secondary text-[11.5px]">
                        {pr.label} ({pr.bracketLabel})
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="text-text-secondary text-[12px] font-bold tracking-wide mb-2">EXERCISE PROGRESSION</p>
          {exerciseTrends.length === 0 ? (
            <div className="bg-card border border-border-soft rounded-card p-4">
              <p className="text-text-muted text-[12.5px] text-center">
                Log an exercise on Today's Workout to start tracking your progression here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {exerciseTrends.map((trend) => (
                <div key={trend.exerciseName} className="bg-card border border-border-soft rounded-card-sm p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-white text-[13px] font-bold truncate">{trend.exerciseName}</p>
                    <span className={`text-[11px] font-bold ${TREND_META[trend.trend].color}`}>{TREND_META[trend.trend].label}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[12px]">
                    {trend.previousLabel && (
                      <>
                        <span className="text-text-muted">{trend.previousLabel}</span>
                        <span className="text-text-muted">→</span>
                      </>
                    )}
                    <span className="text-text-secondary font-semibold">{trend.currentLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'Nutrition' && (
        <div className="px-4 mt-5">
          <p className="text-text-secondary text-[12px] font-bold tracking-wide mb-2">NUTRITION ADHERENCE</p>
          {summary.nutrition.hasDetailedData ? (
            <div className="bg-card border border-border-soft rounded-card p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-text-muted text-[11px] font-semibold">Calories</p>
                  <p className="text-white text-[18px] font-extrabold">{summary.nutrition.caloriesAdherencePct}%</p>
                </div>
                <div>
                  <p className="text-text-muted text-[11px] font-semibold">Protein</p>
                  <p className="text-white text-[18px] font-extrabold">{summary.nutrition.proteinAdherencePct}%</p>
                </div>
              </div>
              <p className={`text-[11.5px] font-semibold mt-2 ${PERF_TREND_META[summary.nutrition.trend.state].color}`}>
                {PERF_TREND_META[summary.nutrition.trend.state].label} vs last week
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border-soft rounded-card p-4">
              <p className="text-text-muted text-[12.5px] text-center">Log your meals to see detailed nutrition progress.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'Body' && (
        <div className="px-4 mt-5">
          <p className="text-text-secondary text-[12px] font-bold tracking-wide mb-2">READINESS & RECOVERY</p>
          {summary.readiness.hasData ? (
            <div className="bg-card border border-border-soft rounded-card p-4 mb-4">
              <div className="flex items-center justify-between">
                <p className="text-white text-[20px] font-extrabold">{summary.readiness.averageScore}</p>
                <p className={`text-[11.5px] font-semibold ${PERF_TREND_META[summary.readiness.scoreTrend.state].color}`}>
                  {PERF_TREND_META[summary.readiness.scoreTrend.state].label}
                </p>
              </div>
              <p className="text-text-muted text-[11.5px] mt-1">
                {summary.readiness.lowReadinessDaysCount} low-readiness day{summary.readiness.lowReadinessDaysCount === 1 ? '' : 's'} recently
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border-soft rounded-card p-4 mb-4">
              <p className="text-text-muted text-[12.5px] text-center">Complete a Daily Check-in to see your readiness trend.</p>
            </div>
          )}

          <p className="text-text-secondary text-[12px] font-bold tracking-wide mb-2">WEIGHT TREND</p>
          <div className="bg-card border border-border-soft rounded-card p-4">
            {summary.weight.hasData ? (
              <>
                <p className={`text-[12.5px] font-semibold ${PERF_TREND_META[summary.weight.trend.state].color}`}>
                  {PERF_TREND_META[summary.weight.trend.state].label}
                </p>
                {summary.weight.goalAlignment === 'aligned' && (
                  <p className="text-text-secondary text-[12px] mt-1">This trend lines up with your goal.</p>
                )}
                {summary.weight.goalAlignment === 'diverging' && (
                  <p className="text-text-secondary text-[12px] mt-1">This trend is moving away from your stated goal.</p>
                )}
                {summary.weight.goalAlignment === 'stable_as_expected' && (
                  <p className="text-text-secondary text-[12px] mt-1">Your weight is holding steady, as expected for your goal.</p>
                )}
              </>
            ) : (
              <p className="text-text-muted text-[12.5px] text-center">Add more weigh-ins to see a weight trend.</p>
            )}
          </div>
        </div>
      )}

      <BottomNav />
    </Screen>
  );
}
