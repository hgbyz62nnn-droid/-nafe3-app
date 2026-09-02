import { Screen } from '../components/ui/Screen';
import { BottomNav } from '../components/ui/BottomNav';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';

function ProgressRing({ percent, color }: { percent: number; color: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90">
      <circle cx="19" cy="19" r={r} stroke="#242428" strokeWidth="3.5" fill="none" />
      <circle
        cx="19"
        cy="19"
        r={r}
        stroke={color}
        strokeWidth="3.5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatTile({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="bg-card rounded-card-sm border border-border-soft px-2 py-2.5 flex-1 min-w-0">
      <div className="text-text-secondary text-[9px] tracking-tight font-medium mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </div>
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <Screen>
      <StatusBar />

      <div className="px-5 pt-3 flex items-start justify-between">
        <div>
          <p className="text-text-secondary text-[15px]">Good morning,</p>
          <p className="text-white text-[26px] font-extrabold leading-tight">
            Abdallah <span className="align-middle">👋</span>
          </p>
        </div>
        <button className="relative w-10 h-10 rounded-full bg-card border border-border-soft flex items-center justify-center shrink-0 mt-1">
          <Icon name="notification" size={19} className="text-white" />
          <span className="absolute -top-1 -right-1 bg-red text-white text-[10px] font-bold w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full flex items-center justify-center">
            3
          </span>
        </button>
      </div>

      <div className="px-5 mt-5">
        <p className="text-text-secondary text-[11px] font-bold tracking-wider uppercase mb-2">
          Today's Plan
        </p>

        <div className="relative rounded-card border-2 border-red overflow-hidden bg-card">
          <div className="relative h-[205px]">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 78% 30%, rgba(224,39,46,0.18), transparent 55%), linear-gradient(135deg, #17171b 0%, #0c0c0f 60%, #050506 100%)',
              }}
            />
            {/*
              Replaceable slot: pass src={heroWorkoutPhotoUrl} once a real
              licensed TRAINO athlete photo exists — position/crop/size
              stay exactly as matched against the reference, nothing else
              needs to change.
            */}
            <AssetSlot
              className="absolute right-[-10px] bottom-0 top-6 w-[62%] opacity-90"
              fit="contain"
              position="bottom right"
              label="Athlete photo"
              placeholderIcon={
                <svg viewBox="0 0 200 230" className="w-full h-full" preserveAspectRatio="xMidYMax meet">
                  <ellipse cx="100" cy="225" rx="70" ry="8" fill="black" opacity="0.35" />
                  <g fill="#2a2a2e">
                    <circle cx="118" cy="46" r="17" />
                    <path d="M85 92c6-20 20-30 36-30s28 9 33 27l8 55c2 10-4 19-14 20l-10 1-4 40-14 1-3-45-16 2-6 44-14-1 4-46c-9-3-14-12-11-22Z" />
                  </g>
                </svg>
              }
            />
            <div className="absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-card via-transparent to-transparent" />
            <div className="absolute left-4 top-4 right-4">
              <p className="text-text-secondary text-[11px] font-bold tracking-wider uppercase">
                Football Performance
              </p>
              <p className="text-white text-[26px] font-extrabold leading-[1.15] mt-1">
                Speed +<br />Lower Body
              </p>
              <div className="flex items-center gap-3 mt-3 text-white text-[13px] font-medium">
                <span className="flex items-center gap-1.5">
                  <Icon name="clock" size={15} />
                  45 min
                </span>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1.5">
                  <Icon name="target" size={15} />
                  Medium
                </span>
              </div>
            </div>
          </div>

          <div className="p-3">
            <button className="w-full bg-red hover:bg-red-dim transition-colors rounded-button py-3.5 flex items-center justify-center gap-2 shadow-button">
              <span className="text-white font-extrabold text-[15px] tracking-wide">START WORKOUT</span>
              <Icon name="playTriangle" size={14} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 mt-5 flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-[11px] font-bold tracking-wider uppercase">
            Your Progress
          </p>
          <p className="text-text-secondary text-[13px] mt-0.5">This Week</p>
        </div>
        <button className="text-red text-[13px] font-semibold">View all</button>
      </div>

      <div className="px-5 mt-3 flex gap-2">
        <StatTile label="Workouts">
          <p className="text-white text-[20px] font-extrabold leading-none">
            12<span className="text-text-muted text-[13px] font-medium">/14</span>
          </p>
        </StatTile>
        <StatTile label="Performance">
          <p className="text-white text-[20px] font-extrabold leading-none mb-1">68%</p>
          <svg viewBox="0 0 60 20" className="w-full h-4">
            <polyline
              points="0,16 10,13 20,15 28,9 38,11 48,4 58,2"
              fill="none"
              stroke="#E0272E"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </StatTile>
        <StatTile label="Nutrition">
          <p className="text-white text-[20px] font-extrabold leading-none mb-1">87%</p>
          <div className="relative w-[38px] h-[38px]">
            <ProgressRing percent={87} color="#3DDC84" />
            <Icon
              name="nutrition"
              size={13}
              className="text-success absolute inset-0 m-auto"
            />
          </div>
        </StatTile>
        <StatTile label="Recovery">
          <p className="text-white text-[20px] font-extrabold leading-none mb-1">82%</p>
          <div className="relative w-[38px] h-[38px]">
            <ProgressRing percent={82} color="#4A9EFF" />
            <Icon name="heart" size={13} className="text-info absolute inset-0 m-auto" />
          </div>
        </StatTile>
      </div>

      <div className="px-5 mt-3.5">
        <div className="bg-card rounded-card border border-border-soft p-3.5 relative overflow-hidden">
          <p className="text-text-secondary text-[11px] font-bold tracking-wider uppercase mb-1.5">
            AI Coach
          </p>
          <p className="text-white text-[13px] leading-relaxed max-w-[65%]">
            Your recovery looks good today. I've prepared your next session for optimal
            performance.
          </p>
          <button className="text-red text-[13px] font-bold mt-2.5">Chat with AI</button>
          <div className="absolute right-4 bottom-3 text-red drop-shadow-[0_0_8px_rgba(224,39,46,0.5)]">
            <Icon name="aiMascot" size={50} strokeWidth={1.6} />
          </div>
        </div>
      </div>

      <BottomNav />
    </Screen>
  );
}
