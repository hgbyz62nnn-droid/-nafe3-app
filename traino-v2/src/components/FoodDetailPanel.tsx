import { useNavigate } from 'react-router-dom';
import { Icon } from './ui/Icon';
import { AssetSlot } from './ui/AssetSlot';
import { getFood } from '../domain/nutrition/registry';
import { suggestFoodAlternatives, type FoodAthleteConstraints } from '../domain/nutrition/matchingEngine';
import { FOOD_MATCH_REASON_LABELS } from '../domain/nutrition/labels';
import { formatEnumLabel } from '../domain/exercise/labels';
import { useFoodPreferences } from '../domain/state/FoodPreferenceContext';
import type { FoodDefinition, MealRole } from '../domain/nutrition/types';

/**
 * Food Intelligence detail/replace panel — the Nutrition Engine equivalent of
 * ExerciseDetailPanel.tsx, reusing the exact same in-flow expanding-card pattern
 * (`bg-card-nested`, `rounded-card-sm`, inline under the meal-item row). No new
 * modal/overlay system, no redesign.
 */

export interface FoodDetailPanelProps {
  foodId: string;
  role: MealRole;
  /** This item's actual planned quantity, for a scaled per-item macro readout. */
  quantity: number;
  constraints: FoodAthleteConstraints;
  onClose: () => void;
  onSelectReplacement: (food: FoodDefinition) => void;
}

export default function FoodDetailPanel({ foodId, role, quantity, constraints, onClose, onSelectReplacement }: FoodDetailPanelProps) {
  const navigate = useNavigate();
  const { getExplicitSignal, setLiked, setDisliked } = useFoodPreferences();
  const food = getFood(foodId);

  if (!food) {
    return (
      <div className="bg-card-nested border border-border-soft rounded-card-sm p-3.5 mt-1 mb-2">
        <div className="flex items-center justify-between">
          <p className="text-white text-[12.5px] font-bold">{foodId}</p>
          <button onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} className="text-text-muted" />
          </button>
        </div>
        <p className="text-text-secondary text-[12px] mt-2">No additional details available for this food yet.</p>
      </div>
    );
  }

  const candidates = suggestFoodAlternatives(food.id, role, constraints, 4);
  const signal = getExplicitSignal(food.id);

  return (
    <div className="bg-card-nested border border-border-soft rounded-card-sm p-3.5 mt-1 mb-2">
      <div className="flex items-center justify-between">
        <p className="text-white text-[13.5px] font-bold">{food.displayName}</p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/ai-coach', { state: { foodId: food.id, foodRole: role } })}
            className="flex items-center gap-1 border border-border-soft rounded-chip px-2.5 py-1"
            aria-label="Ask AI Coach about this food"
          >
            <Icon name="aiMascot" size={12} className="text-red" />
            <span className="text-text-secondary text-[10.5px] font-semibold">Ask AI Coach</span>
          </button>
          <button onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} className="text-text-muted" />
          </button>
        </div>
      </div>

      <AssetSlot className="w-full h-28 rounded-lg mt-2.5" fit="cover" label={food.displayName} />

      <div className="flex flex-wrap gap-1.5 mt-3">
        {food.mealRoles.map((r) => (
          <span key={r} className="bg-red/10 border border-red/30 text-red text-[10.5px] font-semibold rounded-full px-2.5 py-1">
            {formatEnumLabel(r)}
          </span>
        ))}
        {food.region === 'egyptian_mena' && (
          <span className="border border-border-soft text-text-secondary text-[10.5px] font-semibold rounded-full px-2.5 py-1">
            Egyptian/MENA staple
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 mt-3 text-text-secondary text-[11.5px]">
        <span>{Math.round(food.calories * quantity)} kcal</span>
        <span>{Math.round(food.proteinG * quantity * 10) / 10}g protein</span>
        <span>{Math.round(food.carbsG * quantity * 10) / 10}g carbs</span>
        <span>{Math.round(food.fatG * quantity * 10) / 10}g fat</span>
      </div>
      <p className="text-text-muted text-[11px] mt-1.5">
        Per serving ({food.servingSize}{food.servingUnit}): {food.calories} kcal — {food.proteinG}g protein, {food.carbsG}g carbs, {food.fatG}g fat.
      </p>

      {food.allergens.length > 0 && (
        <p className="text-text-muted text-[11px] mt-1.5">Contains: {food.allergens.map(formatEnumLabel).join(', ')}</p>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => setLiked(food.id)}
          className={`flex-1 border rounded-card-sm py-2 text-[11px] font-semibold ${
            signal === 'liked' ? 'border-red bg-red/10 text-red' : 'border-border-soft text-text-secondary'
          }`}
        >
          Like
        </button>
        <button
          onClick={() => setDisliked(food.id)}
          className={`flex-1 border rounded-card-sm py-2 text-[11px] font-semibold ${
            signal === 'disliked' ? 'border-red bg-red/10 text-red' : 'border-border-soft text-text-secondary'
          }`}
        >
          Not for me
        </button>
      </div>

      {candidates.length > 0 && (
        <div className="mt-3.5">
          <p className="text-white text-[11.5px] font-bold">Replace with</p>
          <div className="mt-1.5 space-y-1.5">
            {candidates.map((c) => (
              <button
                key={c.food.id}
                onClick={() => onSelectReplacement(c.food)}
                className="w-full flex items-center justify-between gap-2 bg-card border border-border-soft rounded-card-sm px-3 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-white text-[12px] font-bold truncate">{c.food.displayName}</span>
                  <span className="block text-text-muted text-[10.5px] mt-0.5 truncate">
                    {c.reasons.slice(0, 2).map((r) => FOOD_MATCH_REASON_LABELS[r]).join(' · ')}
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
