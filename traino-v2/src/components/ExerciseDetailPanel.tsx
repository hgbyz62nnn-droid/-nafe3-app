import { useNavigate } from 'react-router-dom';
import { Icon } from './ui/Icon';
import { AssetSlot } from './ui/AssetSlot';
import { EQUIPMENT_OPTIONS } from '../domain/assessment/equipment';
import { getExerciseByName, getProgressions, getRegressions } from '../domain/exercise/registry';
import { suggestReplacements, type AthleteConstraints } from '../domain/exercise/matchingEngine';
import { formatEnumLabel, MATCH_REASON_LABELS } from '../domain/exercise/labels';
import type { ExerciseDefinition } from '../domain/exercise/types';

/**
 * Exercise Intelligence detail/replace panel — the UI surface spec §19 asks for
 * ("name/target muscles/equipment/difficulty/training intent/instructions/coaching
 * cues/video-image placeholder/Replace Exercise/Progression/Regression"). Reuses the
 * exact same in-flow expanding-card pattern `ExerciseLogPanel` already established
 * (`bg-card-nested`, `rounded-card-sm`, inline under the exercise row) — no new
 * modal/overlay system, no redesign.
 */

function equipmentName(id: string): string {
  return EQUIPMENT_OPTIONS.find((e) => e.id === id)?.name ?? formatEnumLabel(id);
}

export interface ExerciseDetailPanelProps {
  exerciseName: string;
  constraints: AthleteConstraints;
  onClose: () => void;
  onSelectReplacement: (exercise: ExerciseDefinition) => void;
}

export default function ExerciseDetailPanel({ exerciseName, constraints, onClose, onSelectReplacement }: ExerciseDetailPanelProps) {
  const navigate = useNavigate();
  const definition = getExerciseByName(exerciseName);

  if (!definition) {
    return (
      <div className="bg-card-nested border border-border-soft rounded-card-sm p-3.5 mt-1 mb-2">
        <div className="flex items-center justify-between">
          <p className="text-white text-[12.5px] font-bold">{exerciseName}</p>
          <button onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} className="text-text-muted" />
          </button>
        </div>
        <p className="text-text-secondary text-[12px] mt-2">No additional details available for this exercise yet.</p>
      </div>
    );
  }

  const candidates = suggestReplacements(definition.id, constraints, 4);
  const easier = getRegressions(definition.id)[0];
  const harder = getProgressions(definition.id)[0];

  return (
    <div className="bg-card-nested border border-border-soft rounded-card-sm p-3.5 mt-1 mb-2">
      <div className="flex items-center justify-between">
        <p className="text-white text-[13.5px] font-bold">{definition.displayName}</p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/ai-coach', { state: { exerciseName: definition.displayName } })}
            className="flex items-center gap-1 border border-border-soft rounded-chip px-2.5 py-1"
            aria-label="Ask AI Coach about this exercise"
          >
            <Icon name="aiMascot" size={12} className="text-red" />
            <span className="text-text-secondary text-[10.5px] font-semibold">Ask AI Coach</span>
          </button>
          <button onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} className="text-text-muted" />
          </button>
        </div>
      </div>

      <AssetSlot className="w-full h-28 rounded-lg mt-2.5" fit="cover" label={definition.displayName} />

      <div className="flex flex-wrap gap-1.5 mt-3">
        {definition.primaryMuscles.map((m) => (
          <span key={m} className="bg-red/10 border border-red/30 text-red text-[10.5px] font-semibold rounded-full px-2.5 py-1">
            {formatEnumLabel(m)}
          </span>
        ))}
        {definition.secondaryMuscles.map((m) => (
          <span key={m} className="border border-border-soft text-text-secondary text-[10.5px] font-semibold rounded-full px-2.5 py-1">
            {formatEnumLabel(m)}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-3 text-text-secondary text-[11.5px]">
        <span className="flex items-center gap-1.5">
          <Icon name="dumbbell" size={13} className="text-text-secondary" />
          {definition.equipment.length > 0 ? definition.equipment.map(equipmentName).join(', ') : 'Bodyweight'}
        </span>
        <span className="flex items-center gap-1.5">
          <Icon name="target" size={13} className="text-text-secondary" />
          {formatEnumLabel(definition.difficulty)}
        </span>
      </div>

      {definition.trainingIntents.length > 0 && (
        <p className="text-text-muted text-[11px] mt-1.5">Focus: {definition.trainingIntents.map(formatEnumLabel).join(', ')}</p>
      )}

      {definition.instructions.length > 0 && (
        <div className="mt-3">
          <p className="text-white text-[11.5px] font-bold">How to do it</p>
          <ol className="mt-1 space-y-1 list-decimal list-inside">
            {definition.instructions.map((step, i) => (
              <li key={i} className="text-text-secondary text-[11.5px]">
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {definition.coachingCues.length > 0 && (
        <div className="mt-3">
          <p className="text-white text-[11.5px] font-bold">Coaching cues</p>
          <ul className="mt-1 space-y-1 list-disc list-inside">
            {definition.coachingCues.map((cue, i) => (
              <li key={i} className="text-text-secondary text-[11.5px]">
                {cue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(easier || harder) && (
        <div className="flex items-center gap-2 mt-3">
          {easier && (
            <button
              onClick={() => onSelectReplacement(easier)}
              className="flex-1 border border-border-soft rounded-card-sm py-2 text-text-secondary text-[11px] font-semibold"
            >
              Easier: {easier.displayName}
            </button>
          )}
          {harder && (
            <button
              onClick={() => onSelectReplacement(harder)}
              className="flex-1 border border-border-soft rounded-card-sm py-2 text-text-secondary text-[11px] font-semibold"
            >
              Harder: {harder.displayName}
            </button>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-3.5">
          <p className="text-white text-[11.5px] font-bold">Replace with</p>
          <div className="mt-1.5 space-y-1.5">
            {candidates.map((c) => (
              <button
                key={c.exercise.id}
                onClick={() => onSelectReplacement(c.exercise)}
                className="w-full flex items-center justify-between gap-2 bg-card border border-border-soft rounded-card-sm px-3 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-white text-[12px] font-bold truncate">{c.exercise.displayName}</span>
                  <span className="block text-text-muted text-[10.5px] mt-0.5 truncate">
                    {c.reasons.slice(0, 2).map((r) => MATCH_REASON_LABELS[r]).join(' · ')}
                  </span>
                </span>
                <Icon name="chevronRight" size={14} className="text-text-muted shrink-0" strokeWidth={2} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
