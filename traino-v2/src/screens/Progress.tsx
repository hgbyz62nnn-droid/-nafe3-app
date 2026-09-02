import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { BottomNav } from '../components/ui/BottomNav';

const TABS = ['Overview', 'Training', 'Nutrition', 'Body'];

const PERF_CARDS = [
  { label: 'Speed', pct: '12%', color: '#F5A623', points: [2, 4, 3, 6, 8, 10, 14] },
  { label: 'Stamina', pct: '8%', color: '#E0272E', points: [3, 5, 6, 8, 9, 12, 15] },
  { label: 'Strength', pct: '15%', color: '#3DDC84', points: [4, 6, 8, 9, 12, 15, 18] },
];

const WEIGHT_POINTS = [74.2, 73.8, 73.9, 73.5, 73.6, 73.1, 73.3, 72.9, 73.0, 72.6, 72.8, 72.4];

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

export default function Progress() {
  const [tab, setTab] = useState('Overview');

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
        <p className="text-text-secondary text-[12px]">This Month</p>
      </div>

      <div className="px-4 mt-2 grid grid-cols-3 gap-2">
        {PERF_CARDS.map((c) => (
          <div key={c.label} className="bg-card border border-border-soft rounded-card-sm p-2.5">
            <p className="text-text-secondary text-[11px] font-semibold">{c.label}</p>
            <div className="mt-1">
              <Sparkline points={c.points} color={c.color} />
            </div>
            <p className="text-[12px] font-extrabold mt-1" style={{ color: c.color }}>
              ↑ {c.pct}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 mt-5">
        <p className="text-text-secondary text-[12px] font-bold tracking-wide">WEIGHT</p>
        <p className="text-success text-[12.5px] font-bold">↓ -1.2 kg</p>
      </div>

      <div className="px-4 mt-2">
        <div className="bg-card border border-border-soft rounded-card p-4">
          <div className="flex items-start justify-between">
            <p className="text-white text-[24px] font-extrabold">72.4 kg</p>
            <Icon name="dotsVertical" size={16} className="text-text-muted mt-1" />
          </div>
          <div className="mt-2">
            <WeightChart points={WEIGHT_POINTS} />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-text-muted text-[11px]">18 Apr</span>
            <span className="text-text-muted text-[11px]">2 May</span>
            <span className="text-text-muted text-[11px]">18 May</span>
          </div>
        </div>
      </div>

      <BottomNav />
    </Screen>
  );
}
