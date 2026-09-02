import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';
import { BottomNav } from '../components/ui/BottomNav';

const MACROS = [
  { label: 'Protein', value: 168, total: 175, unit: 'g', color: '#3DDC84' },
  { label: 'Carbs', value: 280, total: 300, unit: 'g', color: '#3B82F6' },
  { label: 'Fat', value: 61, total: 65, unit: 'g', color: '#F5A623' },
];

const MEALS = [
  { name: 'Breakfast', desc: 'Oatmeal, Banana, Whey Protein', kcal: 620, logged: true },
  { name: 'Lunch', desc: 'Chicken, Rice, Vegetables', kcal: 710, logged: true },
  { name: 'Snack', desc: 'Greek Yogurt, Nuts', kcal: 300, logged: true },
  { name: 'Dinner', desc: 'Salmon, Potatoes, Salad', kcal: 610, logged: false },
];

function CalorieRing({ value, total }: { value: number; total: number }) {
  const size = 168;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = value / total;
  const redFrac = 0.075;
  const greenFrac = filled - redFrac;
  const grayFrac = 1 - filled;

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
        <span className="text-white text-[13px] font-bold">{total - value} kcal</span>
      </div>
    </div>
  );
}

export default function Nutrition() {
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

      <p className="text-text-secondary text-[13px] px-4 mt-3">Today, 18 May</p>

      <div className="flex items-center gap-4 px-4 mt-3">
        <CalorieRing value={2340} total={2500} />
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
                  style={{ width: `${(m.value / m.total) * 100}%`, backgroundColor: m.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-text-secondary text-[12px] font-bold tracking-wide px-4 mt-5">MEALS</p>

      <div className="px-4 mt-2 flex flex-col gap-2.5">
        {MEALS.map((meal) => (
          <div
            key={meal.name}
            className="flex items-center gap-2.5 bg-card border border-border-soft rounded-card-sm px-2.5 py-2"
          >
            <AssetSlot className="w-11 h-11 rounded-[12px] shrink-0" fit="cover" compact />
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13.5px] font-bold">{meal.name}</p>
              <p className="text-text-secondary text-[11.5px] mt-0.5 truncate">{meal.desc}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {meal.logged && <Icon name="checkPlain" size={12} className="text-success" strokeWidth={2.8} />}
              <span className="text-white text-[12.5px] font-bold">{meal.kcal} kcal</span>
            </div>
          </div>
        ))}
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
