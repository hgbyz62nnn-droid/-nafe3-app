import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';
import { BottomNav } from '../components/ui/BottomNav';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import { generateMealPlan, getMealAlternative } from '../domain/engine/nutritionPlanEngine';
import { MEAL_LIBRARY } from '../domain/nutrition/meals';
import type { MealSlot } from '../domain/engine/types';

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

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
  const { today, getDayLog, toggleMealLogged, setMealOverride } = useLogs();
  const dayLog = getDayLog(today);

  const plan = generateMealPlan(answers, targets).map((entry) => {
    const overrideId = dayLog.mealOverrides[entry.slot];
    const meal = overrideId ? (MEAL_LIBRARY.find((m) => m.id === overrideId) ?? entry.meal) : entry.meal;
    return { slot: entry.slot, meal };
  });

  function toggleLogged(slot: MealSlot) {
    toggleMealLogged(today, slot);
  }

  function swapMeal(slot: MealSlot, currentMealId: string) {
    const next = getMealAlternative(slot, currentMealId, answers);
    if (next) setMealOverride(today, slot, next.id);
  }

  const loggedKcal = plan
    .filter((entry) => entry.meal && dayLog.loggedMealSlots.includes(entry.slot))
    .reduce((sum, entry) => sum + (entry.meal?.kcal ?? 0), 0);
  const consumedRatio = targets.calories > 0 ? Math.min(loggedKcal / targets.calories, 1) : 0;

  const MACROS = [
    {
      label: 'Protein',
      value: Math.round(targets.proteinG * consumedRatio),
      total: targets.proteinG,
      unit: 'g',
      color: '#3DDC84',
    },
    {
      label: 'Carbs',
      value: Math.round(targets.carbsG * consumedRatio),
      total: targets.carbsG,
      unit: 'g',
      color: '#3B82F6',
    },
    {
      label: 'Fat',
      value: Math.round(targets.fatG * consumedRatio),
      total: targets.fatG,
      unit: 'g',
      color: '#F5A623',
    },
  ];

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

      <p className="text-text-secondary text-[12px] font-bold tracking-wide px-4 mt-5">MEALS</p>

      <div className="px-4 mt-2 flex flex-col gap-2.5">
        {plan.map(({ slot, meal }) => {
          const logged = dayLog.loggedMealSlots.includes(slot);

          if (!meal) {
            return (
              <div
                key={slot}
                className="flex items-center gap-2.5 bg-card border border-border-soft rounded-card-sm px-2.5 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[13.5px] font-bold">{SLOT_LABEL[slot]}</p>
                  <p className="text-text-muted text-[11.5px] mt-0.5">
                    No meal matches your preferences for this slot
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div
              key={slot}
              className="flex items-center gap-2.5 bg-card border border-border-soft rounded-card-sm px-2.5 py-2"
            >
              <AssetSlot className="w-11 h-11 rounded-[12px] shrink-0" fit="cover" compact />
              <div className="flex-1 min-w-0">
                <p className="text-white text-[13.5px] font-bold">{SLOT_LABEL[slot]}</p>
                <p className="text-text-secondary text-[11.5px] mt-0.5 truncate">{meal.description}</p>
              </div>
              <button
                onClick={() => swapMeal(slot, meal.id)}
                aria-label="Swap meal"
                className="w-7 h-7 min-w-[28px] rounded-full border border-border-soft flex items-center justify-center shrink-0"
              >
                <Icon name="swap" size={12} className="text-text-secondary" strokeWidth={2} />
              </button>
              <button
                onClick={() => toggleLogged(slot)}
                className="flex items-center gap-1.5 shrink-0"
                aria-label={logged ? 'Mark meal not eaten' : 'Mark meal eaten'}
              >
                {logged ? (
                  <Icon name="checkPlain" size={12} className="text-success" strokeWidth={2.8} />
                ) : (
                  <span className="w-3 h-3 rounded-full border border-border-soft" />
                )}
                <span className="text-white text-[12.5px] font-bold">{meal.kcal} kcal</span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="px-4 mt-4">
        <button className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button">
          ADD MEAL
        </button>
      </div>

      <BottomNav />
    </Screen>
  );
}
