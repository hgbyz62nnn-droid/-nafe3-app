import { Link, useParams } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { useProfile } from '../domain/state/ProfileContext';
import { useLocale } from '../domain/state/LocaleContext';
import { generatePersonalizedWeek } from '../domain/engine/planEngine';
import { computeProgressionInfo } from '../domain/engine/progressionEngine';
import { useLogs } from '../domain/state/LogContext';
import { parseLocalDateKey } from '../domain/engine/dateUtils';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Read-only preview of one non-today day in the generated week (spec §19 —
 * "VIEW WORKOUT" for a future/other day). Deliberately does not reuse the
 * full contextual machinery TodaysWorkout.tsx uses (readiness/travel/
 * competition/AI-Coach adjustments) — those are inherently about *today*
 * and can't be known in advance for a day that hasn't arrived yet. Today
 * itself is never routed here — Plan.tsx links "today" straight to the
 * real `/todays-workout` experience.
 */
export default function PlanDayDetail() {
  const { dayOfWeek } = useParams<{ dayOfWeek: string }>();
  const { profile, planStartDate } = useProfile();
  const { getLogsSince } = useLogs();
  const { t } = useLocale();

  const progressionLogs = planStartDate ? getLogsSince(planStartDate) : [];
  const { progressionWeek } = computeProgressionInfo(planStartDate, progressionLogs, profile.answers.daysAvailablePerWeek);

  const cycleDayIndex = Number(dayOfWeek);
  const week = generatePersonalizedWeek(profile, planStartDate, new Date(), progressionWeek);
  const day = week.find((d) => d.cycleDayIndex === cycleDayIndex);
  const parsedDate = day ? parseLocalDateKey(day.date) : null;
  const weekdayName = parsedDate ? DAY_NAMES[(parsedDate.getDay() + 6) % 7] : '';

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <div className="flex items-center px-4 mt-1">
        <Link to="/plan" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          {weekdayName.toUpperCase()}
        </h1>
        <div className="w-8 shrink-0" />
      </div>

      {!day || day.type === 'rest' ? (
        <div className="px-4 mt-4">
          <div className="bg-card rounded-card border border-border-soft p-6 text-center">
            <Icon name="moon" size={26} className="text-text-secondary mx-auto" />
            <h2 className="text-white text-[16px] font-extrabold mt-3">{t('plan.rest')}</h2>
          </div>
        </div>
      ) : (
        <div className="px-4 mt-4">
          <div className="bg-card rounded-card border border-border-soft p-4">
            <h2 className="text-white text-[19px] font-extrabold">{day.workout!.name}</h2>
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1.5 text-text-secondary text-[12.5px]">
                <Icon name="clock" size={14} className="text-text-secondary" />
                {day.workout!.durationMin} min
              </span>
              <span className="flex items-center gap-1.5 text-text-secondary text-[12.5px]">
                <Icon name="target" size={14} className="text-text-secondary" />
                {day.workout!.intensity}
              </span>
            </div>
          </div>

          <div className="mt-2">
            {day.workout!.exercises.map((ex, i) => {
              const isTimedBlock = ex.category === 'warmup' || ex.category === 'cooldown';
              return (
                <div
                  key={`${ex.name}-${i}`}
                  className={`flex items-center gap-3 py-4 ${i < day.workout!.exercises.length - 1 ? 'border-b border-border-soft' : ''}`}
                >
                  <span className="text-text-muted text-[14px] font-bold w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[14.5px] font-bold truncate">{ex.name}</p>
                    <p className="text-text-secondary text-[12.5px] mt-0.5">
                      {isTimedBlock ? ex.reps : `${ex.sets} x ${ex.reps}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Screen>
  );
}
