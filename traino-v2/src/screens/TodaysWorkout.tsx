import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { AssetSlot } from '../components/ui/AssetSlot';
import { useProfile } from '../domain/state/ProfileContext';
import { generateTodayWorkout } from '../domain/engine/planEngine';

export default function TodaysWorkout() {
  const { profile } = useProfile();
  const workout = generateTodayWorkout(profile, 0);

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
            const meta = isTimedBlock ? ex.reps : `${ex.sets} x ${ex.reps}`;
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
                  <p className="text-white text-[14.5px] font-bold truncate">{ex.name}</p>
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
        <button className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button">
          START WORKOUT
        </button>
      </div>
    </Screen>
  );
}
