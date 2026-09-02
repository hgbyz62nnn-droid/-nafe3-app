import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import { generateTodayWorkout, applyCoachAdjustment } from '../domain/engine/planEngine';
import { getExerciseAlternatives } from '../domain/engine/exerciseAlternatives';

export default function TodaysWorkout() {
  const { profile, activeAdjustment, setActiveAdjustment } = useProfile();
  const { today, getDayLog, setWorkoutCompleted } = useLogs();
  const [swaps, setSwaps] = useState<Record<number, number>>({});
  const completed = getDayLog(today).workoutCompleted;

  const workout = activeAdjustment
    ? applyCoachAdjustment(profile, undefined, activeAdjustment)
    : generateTodayWorkout(profile);

  function cycleSwap(index: number, altCount: number) {
    setSwaps((prev) => {
      const current = prev[index] ?? -1;
      const next = current + 1 >= altCount ? -1 : current + 1;
      return { ...prev, [index]: next };
    });
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
            const display = swapIndex >= 0 && alternatives[swapIndex] ? alternatives[swapIndex] : ex;
            const meta = isTimedBlock ? display.reps : `${ex.sets} x ${display.reps}`;
            const hasImage = !isTimedBlock;

            return (
              <div
                key={`${ex.name}-${i}`}
                className={`flex items-center gap-3 py-4 ${
                  i < workout.exercises.length - 1 ? 'border-b border-border-soft' : ''
                }`}
              >
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
                <span className="w-8 h-8 min-w-[32px] rounded-full bg-red flex items-center justify-center shrink-0">
                  <Icon name="checkPlain" size={14} className="text-white" strokeWidth={2.8} />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 mt-4">
        <button
          onClick={() => setWorkoutCompleted(today, !completed, workout.name)}
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
