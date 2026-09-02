import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { BottomNav } from '../components/ui/BottomNav';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import { computePerformanceStats, computeWeightTrend, type PerformanceCategory } from '../domain/engine/progressEngine';

const TABS = ['Overview', 'Training', 'Nutrition', 'Body'];

const PERF_META: { category: PerformanceCategory; label: string; color: string }[] = [
  { category: 'speed', label: 'Speed', color: '#F5A623' },
  { category: 'stamina', label: 'Stamina', color: '#E0272E' },
  { category: 'strength', label: 'Strength', color: '#3DDC84' },
];

function Sparkline({ points, color, width = 92, height = 46 }: { points: number[]; color: string; width?: number; height?: number }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / range) * (height - 6) - 3;
    return [x, y];
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3 : 2} fill={color} />
      ))}
    </svg>
  );
}

function WeightChart({ points, height = 100 }: { points: number[]; height?: number }) {
  const vw = 100;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const margin = 3;
  const step = (vw - margin * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = margin + i * step;
    const y = height - ((p - min) / range) * (height - 10) - 5;
    return [x, y];
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L${vw},${height} L0,${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${vw} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="weightFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3DDC84" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#3DDC84" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#weightFade)" />
      <path
        d={path}
        stroke="#3DDC84"
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.6} fill="#0A0A0D" stroke="#3DDC84" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export default function Progress() {
  const [tab, setTab] = useState('Overview');
  const [isLoggingWeight, setIsLoggingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  const { answers } = useProfile();
  const { today, getRecentLogs, logWeight } = useLogs();
  const recentLogs = getRecentLogs(30);

  const stats = computePerformanceStats(recentLogs);
  const weightTrend = computeWeightTrend(recentLogs, answers.weightKg);
  const weightEntries = recentLogs.filter((d) => typeof d.weightKg === 'number');
  const currentWeight = weightTrend.hasData ? weightTrend.points[weightTrend.points.length - 1] : answers.weightKg;

  function submitWeight() {
    const value = parseFloat(weightInput);
    if (!Number.isNaN(value) && value > 0) {
      logWeight(today, value);
    }
    setWeightInput('');
    setIsLoggingWeight(false);
  }

  return (
    <Screen>
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          PROGRESS
        </h1>
        <Icon name="calendar" size={19} className="text-white shrink-0" />
      </div>

      <div className="flex items-center gap-5 px-4 mt-4 border-b border-border-soft">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2.5 text-[13.5px] font-bold relative ${
              tab === t ? 'text-red' : 'text-text-muted'
            }`}
          >
            {t}
            {tab === t && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-red rounded-full" />}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 mt-4">
        <p className="text-text-secondary text-[12px] font-bold tracking-wide">PERFORMANCE</p>
        <p className="text-text-secondary text-[12px]">Last 30 Days</p>
      </div>

      <div className="px-4 mt-2 grid grid-cols-3 gap-2">
        {PERF_META.map((meta) => {
          const stat = stats[meta.category];
          const sign = stat.changePct > 0 ? '↑' : stat.changePct < 0 ? '↓' : '';
          return (
            <div key={meta.category} className="bg-card border border-border-soft rounded-card-sm p-2.5">
              <p className="text-text-secondary text-[11px] font-semibold">{meta.label}</p>
              <div className="mt-1">
                <Sparkline points={stat.trend} color={meta.color} />
              </div>
              {stat.hasData ? (
                <p className="text-[12px] font-extrabold mt-1" style={{ color: meta.color }}>
                  {sign} {Math.abs(stat.changePct)}%
                </p>
              ) : (
                <p className="text-text-muted text-[10.5px] font-semibold mt-1">No sessions yet</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-4 mt-5">
        <p className="text-text-secondary text-[12px] font-bold tracking-wide">WEIGHT</p>
        {weightTrend.hasData && weightTrend.deltaKg !== 0 && (
          <p className={`text-[12.5px] font-bold ${weightTrend.deltaKg < 0 ? 'text-success' : 'text-red'}`}>
            {weightTrend.deltaKg < 0 ? '↓' : '↑'} {Math.abs(weightTrend.deltaKg)} kg
          </p>
        )}
      </div>

      <div className="px-4 mt-2">
        <div className="bg-card border border-border-soft rounded-card p-4">
          <div className="flex items-start justify-between">
            <p className="text-white text-[24px] font-extrabold">{currentWeight} kg</p>
            <button onClick={() => setIsLoggingWeight((v) => !v)} aria-label="Log weight">
              <Icon name="plus" size={16} className="text-text-muted mt-1" />
            </button>
          </div>

          {isLoggingWeight && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                inputMode="decimal"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="Weight in kg"
                className="flex-1 bg-card-nested border border-border-soft rounded-card-sm px-3 py-2 text-white text-[13px] outline-none focus:border-red"
              />
              <button
                onClick={submitWeight}
                className="bg-red rounded-card-sm px-3.5 py-2 text-white text-[12.5px] font-bold"
              >
                Save
              </button>
            </div>
          )}

          <div className="mt-2">
            <WeightChart points={weightTrend.points} />
          </div>

          {weightTrend.hasData ? (
            <div className="flex items-center justify-between mt-1">
              <span className="text-text-muted text-[11px]">{formatShortDate(weightEntries[0].date)}</span>
              {weightEntries.length > 2 && (
                <span className="text-text-muted text-[11px]">
                  {formatShortDate(weightEntries[Math.floor(weightEntries.length / 2)].date)}
                </span>
              )}
              <span className="text-text-muted text-[11px]">
                {formatShortDate(weightEntries[weightEntries.length - 1].date)}
              </span>
            </div>
          ) : (
            <p className="text-text-muted text-[11px] mt-1.5 text-center">Log your weight to start a trend</p>
          )}
        </div>
      </div>

      <BottomNav />
    </Screen>
  );
}
