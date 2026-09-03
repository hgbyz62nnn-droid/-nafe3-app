import { useState } from 'react';
import { Icon } from './ui/Icon';
import type { ResolvedExercise } from '../domain/engine/planEngine';
import type { ExercisePerformanceLog } from '../domain/progression/types';

/**
 * Compact inline logging panel for one exercise on Today's Workout — the entry point
 * for the Progression Engine's evidence (spec §16/§19 "logging flow"). Reuses the
 * existing card/input visual language; no new visual system. Shown only for
 * progressable exercises (`exercise.progression` set by planEngine), never for
 * warmup/cooldown blocks.
 */

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

function parseLeadingNumber(text: string): number | undefined {
  const match = /(\d+(?:\.\d+)?)/.exec(text);
  return match ? Number(match[1]) : undefined;
}

export default function ExerciseLogPanel({
  exercise,
  onSave,
  onCancel,
}: {
  exercise: ResolvedExercise;
  onSave: (entry: Omit<ExercisePerformanceLog, 'date' | 'submittedAt'>) => void;
  onCancel: () => void;
}) {
  const model = exercise.progression?.model;
  const isLoadModel = model === 'load';
  const isDistanceModel = model === 'distance';
  const isDurationModel = model === 'duration';
  const isRepsModel = model === 'rep_range' || isLoadModel;

  const [completedSets, setCompletedSets] = useState(exercise.sets);
  const [achieved, setAchieved] = useState(() => String(parseLeadingNumber(exercise.reps) ?? ''));
  const [loadKg, setLoadKg] = useState(() =>
    exercise.progression?.previousTarget?.loadKg !== undefined ? String(exercise.progression.previousTarget.loadKg) : ''
  );
  const [rir, setRir] = useState<number | undefined>(undefined);

  const achievedLabel = isDistanceModel ? 'Distance (m)' : isDurationModel ? 'Duration (sec)' : 'Reps achieved';

  function handleSave() {
    const achievedNum = achieved.trim() === '' ? undefined : Number(achieved);
    const loadNum = loadKg.trim() === '' ? undefined : Number(loadKg);
    onSave({
      exerciseName: exercise.name,
      prescribedSets: exercise.sets,
      completedSets,
      repsAchieved: isRepsModel && Number.isFinite(achievedNum) ? achievedNum : undefined,
      distanceM: isDistanceModel && Number.isFinite(achievedNum) ? achievedNum : undefined,
      durationSec: isDurationModel && Number.isFinite(achievedNum) ? achievedNum : undefined,
      loadKg: isLoadModel && Number.isFinite(loadNum) ? loadNum : undefined,
      rir,
      wasModified: exercise.substitutionReason !== 'none',
    });
  }

  return (
    <div className="bg-card-nested border border-border-soft rounded-card-sm p-3.5 mt-1 mb-2">
      <div className="flex items-center justify-between">
        <p className="text-white text-[12.5px] font-bold">Log {exercise.name}</p>
        <button onClick={onCancel} aria-label="Cancel">
          <Icon name="close" size={14} className="text-text-muted" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-text-secondary text-[12px]">Sets completed</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCompletedSets((v) => Math.max(0, v - 1))}
            className="w-7 h-7 rounded-full border border-border-soft text-white text-[14px] flex items-center justify-center"
            aria-label="Decrease sets completed"
          >
            −
          </button>
          <span className="text-white text-[13px] font-bold w-6 text-center">{completedSets}</span>
          <button
            onClick={() => setCompletedSets((v) => Math.min(exercise.sets + 2, v + 1))}
            className="w-7 h-7 rounded-full border border-border-soft text-white text-[14px] flex items-center justify-center"
            aria-label="Increase sets completed"
          >
            +
          </button>
        </div>
      </div>

      {model && model !== 'technique' && (
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="text-text-secondary text-[12px] shrink-0">{achievedLabel}</span>
          <input
            type="number"
            inputMode="decimal"
            value={achieved}
            onChange={(e) => setAchieved(e.target.value)}
            className="w-20 bg-card border border-border-soft rounded-card-sm px-2.5 py-1.5 text-white text-[12.5px] text-right outline-none focus:border-red"
          />
        </div>
      )}

      {isLoadModel && (
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="text-text-secondary text-[12px] shrink-0">Load (kg)</span>
          <input
            type="number"
            inputMode="decimal"
            value={loadKg}
            onChange={(e) => setLoadKg(e.target.value)}
            placeholder="e.g. 70"
            className="w-20 bg-card border border-border-soft rounded-card-sm px-2.5 py-1.5 text-white text-[12.5px] text-right placeholder:text-text-muted outline-none focus:border-red"
          />
        </div>
      )}

      {model && model !== 'technique' && (
        <div className="mt-2.5">
          <span className="text-text-secondary text-[12px]">Reps in reserve (optional)</span>
          <div className="flex items-center gap-1.5 mt-1.5">
            {RIR_OPTIONS.map((value) => (
              <button
                key={value}
                onClick={() => setRir((prev) => (prev === value ? undefined : value))}
                className={`w-7 h-7 rounded-full border text-[11.5px] font-bold flex items-center justify-center ${
                  rir === value ? 'border-red bg-red/15 text-red' : 'border-border-soft text-text-secondary'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        className="w-full bg-red rounded-button py-2.5 text-white font-extrabold text-[12.5px] tracking-wide mt-3.5 flex items-center justify-center gap-1.5"
      >
        <Icon name="checkPlain" size={12} strokeWidth={2.8} />
        SAVE
      </button>
    </div>
  );
}
