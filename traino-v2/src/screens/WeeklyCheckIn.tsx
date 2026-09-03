import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { BARRIER_OPTIONS, type BarrierId } from '../domain/coaching/barriers';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import { useWeeklyCoaching } from '../domain/state/WeeklyCoachingContext';
import { useDailyReadiness } from '../domain/state/DailyReadinessContext';
import { useTrainingContext } from '../domain/state/TrainingContextStore';
import { computeProgressionInfo } from '../domain/engine/progressionEngine';
import { buildWeeklyCoachingReview } from '../domain/engine/weeklyCoachingEngine';
import { buildExerciseMetrics } from '../domain/performance/exerciseMetrics';
import { addDays, localDateKey } from '../domain/engine/dateUtils';

export default function WeeklyCheckIn() {
  const navigate = useNavigate();
  const { profile, planStartDate } = useProfile();
  const { getRecentLogs, getLogsSince, getAllLoggedExerciseNames, getExerciseHistory } = useLogs();
  const { getHistoryBefore, getApprovedAdjustmentForWeek, saveReview } = useWeeklyCoaching();
  const { getRecordsInRange } = useDailyReadiness();
  const { travelContexts, competitionEvents } = useTrainingContext();
  const [selected, setSelected] = useState<Set<BarrierId>>(new Set());
  const [note, setNote] = useState('');

  function toggle(id: BarrierId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    const progressionLogs = planStartDate ? getLogsSince(planStartDate) : [];
    const { currentPlanWeek } = computeProgressionInfo(planStartDate, progressionLogs, profile.answers.daysAvailablePerWeek);

    const currentWeekLogs = getRecentLogs(7);
    const priorWeekLogs = getRecentLogs(14).slice(0, 7);
    const checkIn = {
      barrierIds: Array.from(selected),
      note: note.trim() || undefined,
      submittedAt: localDateKey(new Date()),
    };
    const history = getHistoryBefore(currentPlanWeek);

    const today = new Date();
    const currentWeekReadiness = getRecordsInRange(localDateKey(addDays(today, -6)), localDateKey(today));
    const priorWeekReadiness = getRecordsInRange(localDateKey(addDays(today, -13)), localDateKey(addDays(today, -7)));
    const reducedLoadAppliedThisWeek =
      (getApprovedAdjustmentForWeek(currentPlanWeek)?.decision?.proposedChanges?.trainingAdjustment?.volumeMultiplier ?? 1) < 1;

    // Real per-exercise performance evidence for workout_difficulty barrier
    // detection (Phase 11 §7) — the same Phase 10 function Progress/AI Coach
    // build metrics with, never a re-derived difficulty heuristic.
    const weekExercises = getAllLoggedExerciseNames().map((name) => buildExerciseMetrics(name, getExerciseHistory(name)));

    // Travel/Competition-adjusted days never look like normal missed workouts
    // (spec §21) — `computeWeekSummary` context-adjusts the planned-session
    // count internally from the raw weekly cadence + these context arrays,
    // so it's never pre-adjusted (double-adjustment risk) or independently
    // recomputed away from what Weekly Coaching actually reviewed.
    const { decision, readinessNote } = buildWeeklyCoachingReview(
      currentWeekLogs,
      priorWeekLogs,
      profile.answers.daysAvailablePerWeek,
      checkIn,
      profile,
      history,
      currentWeekReadiness,
      priorWeekReadiness,
      reducedLoadAppliedThisWeek,
      { travelContexts, competitionEvents, exercises: weekExercises, nutritionTargets: profile.nutrition }
    );
    saveReview(currentPlanWeek, localDateKey(new Date()), checkIn, decision, readinessNote);
    navigate('/weekly-report');
  }

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/weekly-report" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          WEEKLY CHECK-IN
        </h1>
        <div className="w-8" />
      </div>

      <div className="px-5 mt-4">
        <h2 className="text-white text-[22px] font-extrabold leading-snug">How was your week?</h2>
        <p className="text-text-secondary text-[13.5px] mt-1.5 leading-relaxed">
          Select anything that got in the way — this helps TRAINO adjust next week. Skip it if the week went well.
        </p>
      </div>

      <div className="px-5 mt-4 grid grid-cols-2 gap-2.5">
        {BARRIER_OPTIONS.map((option) => {
          const active = selected.has(option.id);
          return (
            <button
              key={option.id}
              onClick={() => toggle(option.id)}
              className={`flex items-center gap-2.5 rounded-card-sm border-2 px-3 py-3 text-left transition-colors ${
                active ? 'border-red bg-card shadow-card-red' : 'border-border-soft bg-card'
              }`}
            >
              <span className="w-9 h-9 min-w-[36px] rounded-[10px] bg-card-nested flex items-center justify-center shrink-0">
                <Icon name={option.icon} size={16} className="text-white" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-white text-[12.5px] font-bold leading-tight">{option.name}</span>
              </span>
              {active && <Icon name="checkPlain" size={13} className="text-red shrink-0" strokeWidth={2.6} />}
            </button>
          );
        })}
      </div>

      <div className="px-5 mt-5">
        <h2 className="text-white text-[15px] font-bold mb-2">Anything else? (optional)</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="A short note for yourself — TRAINO won't analyze this text."
          className="w-full bg-card border border-border-soft rounded-card-sm px-4 py-3 text-white text-[13.5px] placeholder:text-text-muted outline-none focus:border-red resize-none"
        />
      </div>

      <div className="px-5 mt-6">
        <button
          onClick={handleSubmit}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button"
        >
          CONTINUE
        </button>
      </div>
    </Screen>
  );
}
