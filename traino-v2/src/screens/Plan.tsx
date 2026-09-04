import { Link } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { BottomNav } from '../components/ui/BottomNav';
import { Icon } from '../components/ui/Icon';
import { useProfile } from '../domain/state/ProfileContext';
import { useLogs } from '../domain/state/LogContext';
import { useLocale } from '../domain/state/LocaleContext';
import { generatePersonalizedWeek } from '../domain/engine/planEngine';
import { computeProgressionInfo } from '../domain/engine/progressionEngine';
import { localDateKey, parseLocalDateKey } from '../domain/engine/dateUtils';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weekdayLabel(dateKey: string): string {
  const date = parseLocalDateKey(dateKey);
  if (!date) return '';
  return DAY_LABELS[(date.getDay() + 6) % 7];
}

/**
 * THE primary "Plan" experience (spec §17/§18): the athlete's complete
 * generated week at a glance, sourced from the same deterministic
 * `generatePersonalizedWeek` the Vitest personalization suite covers —
 * never a redirect to Today's Workout. Every day's title/duration/focus
 * shown here is exactly what `generatePersonalizedWeek` resolved, nothing
 * invented on this screen.
 */
export default function Plan() {
  const { profile, planStartDate } = useProfile();
  const { getLogsSince, getDayLog } = useLogs();
  const { t } = useLocale();

  const progressionLogs = planStartDate ? getLogsSince(planStartDate) : [];
  const { progressionWeek, currentPlanWeek } = computeProgressionInfo(
    planStartDate,
    progressionLogs,
    profile.answers.daysAvailablePerWeek
  );

  const week = generatePersonalizedWeek(profile, planStartDate, new Date(), progressionWeek);
  const todayKey = localDateKey(new Date());

  return (
    <Screen>
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <div className="w-8 shrink-0" />
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          {t('plan.title').toUpperCase()}
        </h1>
        <div className="w-8 shrink-0" />
      </div>
      <p className="text-text-secondary text-[12px] text-center mt-1">{t('plan.week', { week: currentPlanWeek })}</p>

      <div className="px-4 mt-4 flex flex-col gap-2.5">
        {week.map((day) => {
          const isToday = day.date === todayKey;
          const completed = day.type === 'training' && getDayLog(day.date).workoutCompleted;

          return (
            <Link
              key={day.cycleDayIndex}
              to={isToday ? '/todays-workout' : `/plan/${day.cycleDayIndex}`}
              className={`flex items-center gap-3 rounded-card border px-4 py-3.5 bg-card ${
                isToday ? 'border-red shadow-card-red' : 'border-border-soft'
              }`}
            >
              <div className="w-11 shrink-0 text-center">
                <p className={`text-[11px] font-bold tracking-wide ${isToday ? 'text-red' : 'text-text-secondary'}`}>
                  {weekdayLabel(day.date)}
                </p>
                {isToday && <p className="text-red text-[9px] font-extrabold tracking-wider mt-0.5">{t('plan.today')}</p>}
              </div>

              <div className="flex-1 min-w-0">
                {day.type === 'training' ? (
                  <>
                    <p className="text-white text-[14px] font-bold truncate">{day.workout!.name}</p>
                    <p className="text-text-secondary text-[12px] mt-0.5 flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Icon name="clock" size={11} className="text-text-secondary" />
                        {day.workout!.durationMin} min
                      </span>
                      <span>{day.workout!.focus}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-text-secondary text-[14px] font-semibold">{t('plan.rest')}</p>
                )}
              </div>

              {completed ? (
                <span className="w-7 h-7 min-w-[28px] rounded-full bg-success flex items-center justify-center shrink-0">
                  <Icon name="checkPlain" size={13} className="text-bg" strokeWidth={2.8} />
                </span>
              ) : day.type === 'training' ? (
                <Icon name="chevronRight" size={16} className="text-text-muted shrink-0" />
              ) : null}
            </Link>
          );
        })}
      </div>

      <BottomNav />
    </Screen>
  );
}
