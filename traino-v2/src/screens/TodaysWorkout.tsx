import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import { useWeeklyCoaching } from '../domain/state/WeeklyCoachingContext';
import { useDailyReadiness } from '../domain/state/DailyReadinessContext';
import { generateTodayWorkout, applyCoachAdjustment } from '../domain/engine/planEngine';
import { computeProgressionInfo } from '../domain/engine/progressionEngine';
import { getExerciseAlternatives } from '../domain/engine/exerciseAlternatives';
import type { ExerciseProgressionContext } from '../domain/engine/progressionIntegration';
import ExerciseLogPanel from '../components/ExerciseLogPanel';

export default function TodaysWorkout() {
  const { profile, activeAdjustment, setActiveAdjustment, planStartDate } = useProfile();
  const { today, getDayLog, setWorkoutCompleted, getLogsSince, getExerciseHistory, logExercisePerformance } = useLogs();
  const { getApprovedAdjustmentForWeek } = useWeeklyCoaching();
  const { getTodayRecord, getRecord } = useDailyReadiness();
  const [swaps, setSwaps] = useState<Record<number, number>>({});
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const completed = getDayLog(today).workoutCompleted;

  const progressionLogs = planStartDate ? getLogsSince(planStartDate) : [];
  const { progressionWeek, currentPlanWeek } = computeProgressionInfo(
    planStartDate,
    progressionLogs,
    profile.answers.daysAvailablePerWeek
  );

  // Precedence (most specific/recent wins outright — never stacked/combined):
  // an explicit per-session AI Coach chat adjustment > today's readiness check-in
  // adjustment (day-level, automatic) > the standing weekly-coaching adjustment
  // (week-level, only for the exact week it was approved for) > the base plan.
  const readinessRecord = getTodayRecord();
  const readinessAdjustment = readinessRecord?.recommendationApplied
    ? (readinessRecord.recommendation.trainingAdjustment ?? null)
    : null;
  const weeklyAdjustment = getApprovedAdjustmentForWeek(currentPlanWeek)?.decision?.proposedChanges?.trainingAdjustment ?? null;
  const effectiveAdjustment = activeAdjustment ?? readinessAdjustment ?? weeklyAdjustment;

  // Performance evidence (Progression Engine) sits below safety/readiness/weekly
  // adjustments in precedence — it decides today's target reps/load within whatever
  // session those higher tiers already resolved, never overriding them.
  const progressionContext: ExerciseProgressionContext = {
    getHistory: getExerciseHistory,
    getReadinessStatus: (date) => getRecord(date)?.status ?? null,
  };

  const workout = effectiveAdjustment
    ? applyCoachAdjustment(profile, undefined, effectiveAdjustment, progressionWeek, progressionContext)
    : generateTodayWorkout(profile, undefined, progressionWeek, progressionContext);

  function cycleSwap(index: number, altCount: number) {
    setSwaps((prev) => {
      const current = prev[index] ?? -1;
      const next = current + 1 >= altCount ? -1 : current + 1;
      return { ...prev, [index]: next };
    });
  }

  function handleLogSave(entry: Parameters<typeof logExercisePerformance>[1]) {
    logExercisePerformance(today, entry);
    setExpandedIndex(null);
  }

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          TODAY'S WORKOUT
        </h1>
        <Icon name="sliders" size={18} className="text-white shrink-0" />
      </div>

      {activeAdjustment && (
        <div className="mx-4 mt-3 flex items-center gap-2.5 bg-red/10 border border-red/40 rounded-card-sm px-3.5 py-2.5">
          <Icon name="aiMascot" size={16} className="text-red shrink-0" />
          <p className="flex-1 text-red text-[12px] font-semibold">Adjusted by AI Coach</p>
          <button
            onClick={() => setActiveAdjustment(null)}
            className="text-text-secondary text-[11.5px] font-semibold underline"
          >
            Reset
          </button>
        </div>
      )}

      {!activeAdjustment && readinessAdjustment && (
        <div className="mx-4 mt-3 flex items-center gap-2.5 bg-red/10 border border-red/40 rounded-card-sm px-3.5 py-2.5">
          <Icon name="battery" size={16} className="text-red shrink-0" />
          <p className="flex-1 text-red text-[12px] font-semibold">
            {readinessRecord?.status === 'recovery' ? "Adjusted for today's recovery" : "Reduced volume based on today's readiness"}
          </p>
          <Link to="/daily-check-in" className="text-text-secondary text-[11.5px] font-semibold underline shrink-0">
            Why?
          </Link>
        </div>
      )}

      {!activeAdjustment && !readinessAdjustment && weeklyAdjustment && (
        <div className="mx-4 mt-3 flex items-center gap-2.5 bg-red/10 border border-red/40 rounded-card-sm px-3.5 py-2.5">
          <Icon name="aiMascot" size={16} className="text-red shrink-0" />
          <p className="flex-1 text-red text-[12px] font-semibold">Adjusted by this week's coaching recommendation</p>
        </div>
      )}

      <div className="px-4 mt-4">
        <div className="bg-card rounded-card border border-border-soft p-4">
          <h2 className="text-white text-[20px] font-extrabold">{workout.name}</h2>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-text-secondary text-[12.5px]">
              <Icon name="clock" size={14} className="text-text-secondary" />
              {workout.durationMin} min
            </span>
            <span className="flex items-center gap-1.5 text-text-secondary text-[12.5px]">
              <Icon name="target" size={14} className="text-text-secondary" />
              {workout.intensity}
            </span>
          </div>
        </div>

        <div className="mt-2">
          {workout.exercises.map((ex, i) => {
            const isTimedBlock = ex.category === 'warmup' || ex.category === 'cooldown';
            const alternatives = getExerciseAlternatives(ex.name);
            const swapIndex = swaps[i] ?? -1;
            const manuallySwapped = swapIndex >= 0 && !!alternatives[swapIndex];
            const display = manuallySwapped ? alternatives[swapIndex] : ex;
            const meta = isTimedBlock ? display.reps : `${ex.sets} x ${display.reps}`;
            const hasImage = !isTimedBlock;
            // A manual (unpersisted) exercise swap changes what's displayed, so logging
            // against `ex.progression` (computed for the original resolved exercise) would
            // attach evidence to the wrong name — the log affordance only appears when the
            // athlete hasn't swapped away from what the Progression Engine actually resolved.
            const canLog = !manuallySwapped && !!ex.progression;
            const showProgressionNote =
              !manuallySwapped && ex.progression && (ex.progression.decision === 'PROGRESS' || ex.progression.decision === 'REGRESS');

            return (
              <div key={`${ex.name}-${i}`} className={i < workout.exercises.length - 1 ? 'border-b border-border-soft' : ''}>
                <div className="flex items-center gap-3 py-4">
                  <span className="text-text-muted text-[14px] font-bold w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[14.5px] font-bold truncate">{display.name}</p>
                    <p className="flex items-center gap-1.5 text-text-secondary text-[12.5px] mt-0.5">
                      {meta}
                      {ex.restSec && (
                        <span className="flex items-center gap-1 text-text-muted">
                          <Icon name="clock" size={11} className="text-text-muted" />
                          {ex.restSec} sec
                        </span>
                      )}
                    </p>
                    {showProgressionNote && (
                      <p className={`text-[11px] font-semibold mt-1 ${ex.progression!.decision === 'PROGRESS' ? 'text-success' : 'text-red'}`}>
                        {ex.progression!.decision === 'PROGRESS' ? '↑ Progressed' : '↓ Adjusted'} — {ex.progression!.reason}
                      </p>
                    )}
                  </div>
                  {!isTimedBlock && alternatives.length > 0 && (
                    <button
                      onClick={() => cycleSwap(i, alternatives.length)}
                      className="w-8 h-8 min-w-[32px] rounded-full border border-border-soft flex items-center justify-center shrink-0"
                      aria-label="Replace exercise"
                    >
                      <Icon name="swap" size={14} className="text-text-secondary" strokeWidth={2} />
                    </button>
                  )}
                  {hasImage && (
                    <AssetSlot className="w-14 h-11 rounded-lg shrink-0" fit="cover" compact />
                  )}
                  <button
                    onClick={() => canLog && setExpandedIndex((prev) => (prev === i ? null : i))}
                    disabled={!canLog}
                    aria-label={canLog ? 'Log this exercise' : undefined}
                    className={`w-8 h-8 min-w-[32px] rounded-full flex items-center justify-center shrink-0 ${
                      expandedIndex === i ? 'bg-white' : 'bg-red'
                    }`}
                  >
                    <Icon name="checkPlain" size={14} className={expandedIndex === i ? 'text-red' : 'text-white'} strokeWidth={2.8} />
                  </button>
                </div>
                {expandedIndex === i && canLog && (
                  <ExerciseLogPanel exercise={ex} onSave={handleLogSave} onCancel={() => setExpandedIndex(null)} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 mt-4">
        <button
          onClick={() => setWorkoutCompleted(today, !completed, workout.name, workout.statCategory)}
          className={`w-full rounded-button py-4 font-extrabold text-[15px] tracking-wide shadow-button flex items-center justify-center gap-2 ${
            completed ? 'bg-success text-bg' : 'bg-red text-white'
          }`}
        >
          {completed ? (
            <>
              <Icon name="checkPlain" size={15} strokeWidth={2.8} />
              WORKOUT COMPLETED
            </>
          ) : (
            'START WORKOUT'
          )}
        </button>
      </div>
    </Screen>
  );
}
