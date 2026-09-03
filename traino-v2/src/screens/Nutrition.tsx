import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';
import { BottomNav } from '../components/ui/BottomNav';
import FoodDetailPanel from '../components/FoodDetailPanel';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import { useFoodPreferences } from '../domain/state/FoodPreferenceContext';
import { deriveNutritionProfile } from '../domain/nutrition/profile';
import { buildDailyPlan } from '../domain/nutrition/mealBuilder';
import { deriveFoodPreferenceSignals, deriveRecentlyUsedFoodIds } from '../domain/nutrition/preferences';
import { getFood } from '../domain/nutrition/registry';
import type { FoodAthleteConstraints } from '../domain/nutrition/matchingEngine';
import type { FoodDefinition } from '../domain/nutrition/types';
import type { MealSlot } from '../domain/engine/types';

/** The 4-slot legacy MealSlot ids the pre-Nutrition-Engine-Expansion barrier detection
 * (`computeNutritionAdherence` / `nutrition_difficulty` / `budget`) still reads from
 * `DayLog.loggedMealSlots`. Any new-plan slotId that happens to match one of these
 * still updates it too, so that existing signal stays fed for the common 3/4-meal
 * case, without requiring `MealSlot` to grow 5-meal-only ids like 'snack_1'. */
const LEGACY_MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
function asLegacySlot(slotId: string): MealSlot | undefined {
  return LEGACY_MEAL_SLOTS.find((s) => s === slotId);
}

function CalorieRing({ value, total }: { value: number; total: number }) {
  const size = 168;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.min(value / total, 1);
  const redFrac = filled > 0 ? 0.075 : 0;
  const greenFrac = filled - redFrac;

  const seg = (frac: number) => `${Math.max(frac, 0) * circumference} ${circumference}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#242428" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#E0272E"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={seg(redFrac)}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#3DDC84"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={seg(greenFrac)}
          strokeDashoffset={-redFrac * circumference}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white text-[30px] font-extrabold leading-none">
          {value.toLocaleString()}
        </span>
        <span className="text-text-secondary text-[12px] mt-1">/ {total.toLocaleString()} kcal</span>
        <span className="text-text-secondary text-[11.5px] mt-2.5">Remaining</span>
        <span className="text-white text-[13px] font-bold">{Math.max(total - value, 0)} kcal</span>
      </div>
    </div>
  );
}

export default function Nutrition() {
  const { answers, profile } = useProfile();
  const targets = profile.nutrition;
  const { today, getDayLog, toggleMealLogged, logNutritionEntry, getNutritionLogsForDate, getAllNutritionLogs } = useLogs();
  const { replacementCounts, explicitSignals, recordReplacement } = useFoodPreferences();
  const [swaps, setSwaps] = useState<Record<string, FoodDefinition>>({});
  const [detailKey, setDetailKey] = useState<string | null>(null);

  const dayLog = getDayLog(today);
  const todayNutritionLogs = getNutritionLogsForDate(today);

  const allNutritionLogs = getAllNutritionLogs();
  const nutritionProfile = deriveNutritionProfile(answers, {
    dislikedFoodIds: [],
    likedFoodIds: Object.entries(explicitSignals)
      .filter(([, s]) => s === 'liked')
      .map(([id]) => id),
    isTrainingDay: true,
  });
  const plan = buildDailyPlan(nutritionProfile, targets);
  const foodConstraints: FoodAthleteConstraints = {
    dietaryPreference: answers.dietaryPreference,
    allergyIds: answers.allergyIds,
    budgetTier: answers.budgetTier,
    preferenceByFoodId: deriveFoodPreferenceSignals(allNutritionLogs, replacementCounts, explicitSignals),
    recentlyUsedFoodIds: deriveRecentlyUsedFoodIds(allNutritionLogs),
  };

  const loggedKcal = todayNutritionLogs.reduce((sum, entry) => sum + entry.calories, 0);
  const loggedProteinG = todayNutritionLogs.reduce((sum, entry) => sum + entry.proteinG, 0);
  const loggedCarbsG = todayNutritionLogs.reduce((sum, entry) => sum + entry.carbsG, 0);
  const loggedFatG = todayNutritionLogs.reduce((sum, entry) => sum + entry.fatG, 0);

  const MACROS = [
    { label: 'Protein', value: Math.round(loggedProteinG), total: targets.proteinG, unit: 'g', color: '#3DDC84' },
    { label: 'Carbs', value: Math.round(loggedCarbsG), total: targets.carbsG, unit: 'g', color: '#3B82F6' },
    { label: 'Fat', value: Math.round(loggedFatG), total: targets.fatG, unit: 'g', color: '#F5A623' },
  ];

  function itemKey(slotId: string, index: number): string {
    return `${slotId}:${index}`;
  }

  function markMealEaten(slotId: string) {
    const meal = plan.meals.find((m) => m.slotId === slotId);
    if (!meal) return;
    meal.items.forEach((item, index) => {
      const key = itemKey(slotId, index);
      const swap = swaps[key];
      const food = swap ?? getFood(item.foodId);
      if (!food) return;
      logNutritionEntry(today, {
        slotId,
        foodId: food.id,
        quantity: item.quantity,
        calories: Math.round(food.calories * item.quantity),
        proteinG: Math.round(food.proteinG * item.quantity * 10) / 10,
        carbsG: Math.round(food.carbsG * item.quantity * 10) / 10,
        fatG: Math.round(food.fatG * item.quantity * 10) / 10,
        wasModified: !!swap,
      });
    });
    const legacySlot = asLegacySlot(slotId);
    if (legacySlot && !dayLog.loggedMealSlots.includes(legacySlot)) {
      toggleMealLogged(today, legacySlot);
    }
  }

  function isMealLogged(slotId: string): boolean {
    return todayNutritionLogs.some((entry) => entry.slotId === slotId);
  }

  function handleSelectReplacement(slotId: string, index: number, replacement: FoodDefinition, originalFoodId: string) {
    recordReplacement(originalFoodId);
    setSwaps((prev) => ({ ...prev, [itemKey(slotId, index)]: replacement }));
    setDetailKey(null);
  }

  return (
    <Screen>
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          NUTRITION
        </h1>
        <Icon name="calendar" size={19} className="text-white shrink-0" />
      </div>

      <p className="text-text-secondary text-[13px] px-4 mt-3">
        Today, {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}
      </p>
      <p className="text-text-muted text-[11px] px-4 mt-1">Estimated daily target</p>

      <div className="flex items-center gap-4 px-4 mt-3">
        <CalorieRing value={loggedKcal} total={targets.calories} />
        <div className="flex-1 flex flex-col gap-3.5">
          {MACROS.map((m) => (
            <div key={m.label}>
              <p className="text-white text-[13px] font-bold">{m.label}</p>
              <p className="text-text-secondary text-[12px] mt-0.5">
                {m.value} / {m.total}
                {m.unit}
              </p>
              <div className="h-1.5 rounded-full bg-border-soft mt-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${m.total > 0 ? (m.value / m.total) * 100 : 0}%`, backgroundColor: m.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {!plan.reconciliation.withinTolerance && (
        <p className="text-text-muted text-[10.5px] px-4 mt-3">
          Today's plan totals {plan.totals.calories} kcal ({plan.reconciliation.caloriesDiff > 0 ? '+' : ''}
          {plan.reconciliation.caloriesDiff} vs target).
        </p>
      )}

      {plan.meals.map((meal) => {
        const logged = isMealLogged(meal.slotId);
        return (
          <div key={meal.slotId} className="px-4 mt-5">
            <div className="flex items-center justify-between">
              <p className="text-text-secondary text-[12px] font-bold tracking-wide">{meal.slotLabel.toUpperCase()}</p>
              <span className="text-text-muted text-[11px]">{meal.totals.calories} kcal</span>
            </div>

            <div className="mt-2 flex flex-col gap-2.5">
              {meal.items.map((item, index) => {
                const key = itemKey(meal.slotId, index);
                const swap = swaps[key];
                const food = swap ?? getFood(item.foodId);
                if (!food) return null;

                return (
                  <div key={key}>
                    <div className="flex items-center gap-2.5 bg-card border border-border-soft rounded-card-sm px-2.5 py-2">
                      <AssetSlot className="w-11 h-11 rounded-[12px] shrink-0" fit="cover" compact />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[13.5px] font-bold truncate">{food.displayName}</p>
                        <p className="text-text-secondary text-[11.5px] mt-0.5">
                          {item.quantity} x {food.servingSize}
                          {food.servingUnit} — {Math.round(food.calories * item.quantity)} kcal
                        </p>
                      </div>
                      <button
                        onClick={() => setDetailKey((prev) => (prev === key ? null : key))}
                        aria-label="View food details / replace"
                        className="w-7 h-7 min-w-[28px] rounded-full border border-border-soft flex items-center justify-center shrink-0"
                      >
                        <Icon name="swap" size={12} className="text-text-secondary" strokeWidth={2} />
                      </button>
                    </div>
                    {detailKey === key && (
                      <FoodDetailPanel
                        foodId={food.id}
                        role={item.role}
                        quantity={item.quantity}
                        constraints={foodConstraints}
                        onClose={() => setDetailKey(null)}
                        onSelectReplacement={(replacement) => handleSelectReplacement(meal.slotId, index, replacement, item.foodId)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => markMealEaten(meal.slotId)}
              disabled={logged}
              className={`w-full mt-2 rounded-card-sm py-2 text-[12px] font-bold flex items-center justify-center gap-1.5 ${
                logged ? 'bg-success/15 text-success' : 'border border-border-soft text-text-secondary'
              }`}
            >
              {logged ? (
                <>
                  <Icon name="checkPlain" size={11} strokeWidth={2.8} />
                  Logged
                </>
              ) : (
                'Mark as eaten'
              )}
            </button>
          </div>
        );
      })}

      <div className="px-4 mt-5 mb-4">
        <Link
          to="/ai-coach"
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button flex items-center justify-center"
        >
          ASK AI COACH
        </Link>
      </div>

      <BottomNav />
    </Screen>
  );
}
