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
import { useExercisePreferences } from '../domain/state/ExercisePreferenceContext';
import { computeProgressionInfo } from '../domain/engine/progressionEngine';
import { getExerciseByName } from '../domain/exercise/registry';
import { derivePreferenceSignals, deriveRecentlyUsedIds } from '../domain/exercise/preferences';
import type { AthleteConstraints } from '../domain/exercise/matchingEngine';
import type { ExerciseDefinition } from '../domain/exercise/types';
import type { ExerciseProgressionContext } from '../domain/engine/progressionIntegration';
import type { ResolvedExercise } from '../domain/engine/planEngine';
import { useTrainingContext } from '../domain/state/TrainingContextStore';
import { composeContextualWorkout } from '../domain/context/composeContextualWorkout';
import ExerciseLogPanel from '../components/ExerciseLogPanel';
import ExerciseDetailPanel from '../components/ExerciseDetailPanel';

export default function TodaysWorkout() {
  const { profile, activeAdjustment, setActiveAdjustment, planStartDate } = useProfile();
  const { today, getDayLog, setWorkoutCompleted, getLogsSince, getRecentLogs, getExerciseHistory, logExercisePerformance } = useLogs();
  const { getApprovedAdjustmentForWeek } = useWeeklyCoaching();
  const { getTodayRecord, getRecord } = useDailyReadiness();
  const { replacementCounts, recordReplacement } = useExercisePreferences();
  const { getResolvedContext } = useTrainingContext();
  const [swaps, setSwaps] = useState<Record<number, ExerciseDefinition>>({});
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const completed = getDayLog(today).workoutCompleted;

  // Deterministic preference/history signals — ranking-only, never a hard filter
  // (see domain/exercise/preferences.ts). A bounded 90-day window is plenty of
  // evidence for "frequently completed/skipped" without scanning the athlete's
  // entire history on every render.
  const recentExerciseLogs = getRecentLogs(90).flatMap((day) => day.exerciseLogs ?? []);
  const athleteConstraints: AthleteConstraints = {
    availableEquipment: profile.answers.equipmentIds,
    injuryIds: profile.answers.injuryIds,
    sport: profile.answers.sport,
    athleteLevel: profile.level,
    preferenceByExerciseId: derivePreferenceSignals(recentExerciseLogs, replacementCounts),
    recentlyUsedExerciseIds: deriveRecentlyUsedIds(recentExerciseLogs),
  };

  const progressionLogs = planStartDate ? getLogsSince(planStartDate) : [];
  const { progressionWeek, currentPlanWeek } = computeProgressionInfo(
    planStartDate,
    progressionLogs,
    profile.answers.daysAvailablePerWeek
  );

  // Precedence (most specific/recent wins outright — never stacked/combined):
  // an explicit per-session AI Coach chat adjustment > today's Competition Mode
  // day-plan > today's readiness check-in adjustment (day-level, automatic) >
  // the standing weekly-coaching adjustment (week-level, only for the exact
  // week it was approved for) > the base plan. Travel Mode's equipment/
  // location/time override composes alongside this chain rather than
  // replacing it — see domain/context/composeContextualWorkout.ts for the
  // full documented precedence rule (spec §15/§16).
  const readinessRecord = getTodayRecord();
  const readinessAdjustment = readinessRecord?.recommendationApplied
    ? (readinessRecord.recommendation.trainingAdjustment ?? null)
    : null;
  const weeklyAdjustment = getApprovedAdjustmentForWeek(currentPlanWeek)?.decision?.proposedChanges?.trainingAdjustment ?? null;

  // Performance evidence (Progression Engine) sits below safety/readiness/weekly
  // adjustments in precedence — it decides today's target reps/load within whatever
  // session those higher tiers already resolved, never overriding them. Travel/
  // competition-tagged logs are excluded from this evidence (see LogContext.tsx /
  // domain/context — a reduced/substituted context-adjusted session must never be
  // read back as evidence the normal exercise should regress, spec §18/§20).
  const progressionContext: ExerciseProgressionContext = {
    getHistory: (name) => getExerciseHistory(name).filter((log) => !log.contextMode),
    getReadinessStatus: (date) => getRecord(date)?.status ?? null,
  };

  const resolvedContext = getResolvedContext(today);
  const { skipNormalSession, contextMessage, workout: composedWorkout } = composeContextualWorkout({
    profile,
    weekNumber: progressionWeek,
    progression: progressionContext,
    activeAdjustment,
    readinessAdjustment,
    weeklyAdjustment,
    resolvedContext,
    athleteConstraints,
  });
  const workout = composedWorkout;
  const isTravelContextActive = resolvedContext.mode === 'travel';
  const isCompetitionContextActive = resolvedContext.mode === 'competition' && !!contextMessage;

  function handleReplace(index: number, sourceExerciseName: string, replacement: ExerciseDefinition) {
    const sourceId = getExerciseByName(sourceExerciseName)?.id;
    if (sourceId) recordReplacement(sourceId);
    setSwaps((prev) => ({ ...prev, [index]: replacement }));
    setDetailIndex(null);
  }

  function handleLogSave(entry: Parameters<typeof logExercisePerformance>[1], ex: ResolvedExercise) {
    // Tag the log with today's active context (spec §19) — undefined for a
    // normal day, the same "absent means nothing unusual" contract every
    // other optional log field already follows. `sourceSlotName` (set by
    // planEngine whenever a substitution occurred, travel or otherwise)
    // becomes the log's "original exercise" for audit/history.
    const contextMode = resolvedContext.mode === 'normal' ? undefined : resolvedContext.mode;
    logExercisePerformance(today, { ...entry, contextMode, originalExerciseName: ex.sourceSlotName });
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
        <Link to="/travel-competition" className="w-8 h-8 flex items-center justify-center shrink-0" aria-label="Travel & Competition Mode">
          <Icon name="sliders" size={18} className="text-white" />
        </Link>
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

      {!activeAdjustment && isCompetitionContextActive && (
        <div className="mx-4 mt-3 flex items-center gap-2.5 bg-red/10 border border-red/40 rounded-card-sm px-3.5 py-2.5">
          <Icon name="calendar" size={16} className="text-red shrink-0" />
          <p className="flex-1 text-red text-[12px] font-semibold">{contextMessage}</p>
        </div>
      )}

      {!activeAdjustment && !isCompetitionContextActive && readinessAdjustment && (
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

      {!activeAdjustment && !isCompetitionContextActive && !readinessAdjustment && weeklyAdjustment && (
        <div className="mx-4 mt-3 flex items-center gap-2.5 bg-red/10 border border-red/40 rounded-card-sm px-3.5 py-2.5">
          <Icon name="aiMascot" size={16} className="text-red shrink-0" />
          <p className="flex-1 text-red text-[12px] font-semibold">Adjusted by this week's coaching recommendation</p>
        </div>
      )}

      {isTravelContextActive && (
        <div className="mx-4 mt-2 flex items-center gap-2 bg-card border border-border-soft rounded-card-sm px-3.5 py-2">
          <Icon name="suitcase" size={14} className="text-text-secondary shrink-0" />
          <p className="text-text-secondary text-[11.5px] font-semibold">Travel Mode active — today's session uses your travel equipment/time</p>
        </div>
      )}

      {skipNormalSession ? (
        <div className="px-4 mt-4">
          <div className="bg-card rounded-card border border-border-soft p-6 text-center">
            <Icon name="calendar" size={28} className="text-red mx-auto" />
            <h2 className="text-white text-[17px] font-extrabold mt-3">Competition Day</h2>
            <p className="text-text-secondary text-[12.5px] mt-1.5">{contextMessage}</p>
          </div>
        </div>
      ) : (
      <>
      <div className="px-4 mt-4">
        <div className="bg-card rounded-card border border-border-soft p-4">
          <h2 className="text-white text-[20px] font-extrabold">{workout!.name}</h2>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-text-secondary text-[12.5px]">
              <Icon name="clock" size={14} className="text-text-secondary" />
              {workout!.durationMin} min
            </span>
            <span className="flex items-center gap-1.5 text-text-secondary text-[12.5px]">
              <Icon name="target" size={14} className="text-text-secondary" />
              {workout!.intensity}
            </span>
          </div>
        </div>

        <div className="mt-2">
          {workout!.exercises.map((ex, i) => {
            const isTimedBlock = ex.category === 'warmup' || ex.category === 'cooldown';
            const manualSwap = swaps[i];
            const manuallySwapped = !!manualSwap;
            const display = manualSwap ? { name: manualSwap.displayName, reps: ex.reps } : ex;
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
              <div key={`${ex.name}-${i}`} className={i < workout!.exercises.length - 1 ? 'border-b border-border-soft' : ''}>
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
                  {!isTimedBlock && (
                    <button
                      onClick={() => {
                        setExpandedIndex(null);
                        setDetailIndex((prev) => (prev === i ? null : i));
                      }}
                      className="w-8 h-8 min-w-[32px] rounded-full border border-border-soft flex items-center justify-center shrink-0"
                      aria-label="View exercise details / replace"
                    >
                      <Icon name="swap" size={14} className="text-text-secondary" strokeWidth={2} />
                    </button>
                  )}
                  {hasImage && (
                    <AssetSlot className="w-14 h-11 rounded-lg shrink-0" fit="cover" compact />
                  )}
                  <button
                    onClick={() => {
                      if (!canLog) return;
                      setDetailIndex(null);
                      setExpandedIndex((prev) => (prev === i ? null : i));
                    }}
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
                  <ExerciseLogPanel exercise={ex} onSave={(entry) => handleLogSave(entry, ex)} onCancel={() => setExpandedIndex(null)} />
                )}
                {detailIndex === i && (
                  <ExerciseDetailPanel
                    exerciseName={ex.name}
                    constraints={athleteConstraints}
                    onClose={() => setDetailIndex(null)}
                    onSelectReplacement={(replacement) => handleReplace(i, display.name, replacement)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 mt-4">
        <button
          onClick={() => setWorkoutCompleted(today, !completed, workout!.name, workout!.statCategory)}
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
      </>
      )}
    </Screen>
  );
}
