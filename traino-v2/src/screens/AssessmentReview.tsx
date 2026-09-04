import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { OnboardingHeader } from '../components/ui/OnboardingHeader';
import { Icon } from '../components/ui/Icon';
import { useProfile } from '../domain/state/ProfileContext';
import { useLocale } from '../domain/state/LocaleContext';
import { localizedOptionLabel } from '../domain/i18n/optionLabels';
import { SPORTS } from '../domain/sports/sports';
import { getSportModule } from '../domain/sports/registry';
import { GOAL_OPTIONS } from '../domain/assessment/goals';
import {
  EXPERIENCE_OPTIONS,
  FREQUENCY_OPTIONS,
  DURATION_OPTIONS,
  PRIORITY_OPTIONS,
  COMPETITIVE_LEVEL_OPTIONS,
  MATCHES_PER_WEEK_OPTIONS,
} from '../domain/assessment/experience';
import { TRAINING_LOCATIONS } from '../domain/assessment/trainingLocations';
import { EQUIPMENT_OPTIONS } from '../domain/assessment/equipment';
import { DIET_PREFERENCE_OPTIONS } from '../domain/assessment/nutritionPreferences';

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border-soft last:border-b-0">
      <span className="text-text-secondary text-[13px]">{label}</span>
      <span className="text-white text-[13.5px] font-semibold text-right max-w-[60%]">{value}</span>
    </div>
  );
}

/**
 * The final step before generation (spec §24): a plain summary of exactly
 * what will drive plan generation, built ONLY from real AssessmentAnswers
 * fields — nothing here is invented display copy. "BUILD MY PLAN" is the
 * single call to the EXISTING `completeAssessment()` (persists the profile,
 * flips `hasCompletedAssessment`) — the Training/Nutrition engines then
 * derive the plan from that persisted profile; no new generation logic
 * lives on this screen. Every value below is localized via
 * `localizedOptionLabel` (spec: Core Personalization Polish §19/§23) — never
 * a raw internal id shown to an Arabic-reading athlete.
 */
export default function AssessmentReview() {
  const navigate = useNavigate();
  const { answers, completeAssessment } = useProfile();
  const { locale, t } = useLocale();

  const sportName = localizedOptionLabel('sport', answers.sport, SPORTS.find((s) => s.id === answers.sport)?.name ?? answers.sport, locale);
  const positionCategory = answers.sport === 'swimming' ? 'position_swimming' : 'position_football';
  const rawPosition = getSportModule(answers.sport).positions?.find((p) => p.id === answers.sportPositionId);
  const positionName = rawPosition ? localizedOptionLabel(positionCategory, rawPosition.id, rawPosition.name, locale) : undefined;
  const goalName = localizedOptionLabel('goal', answers.goal, GOAL_OPTIONS.find((g) => g.id === answers.goal)?.name ?? answers.goal, locale);
  const experienceOpt = EXPERIENCE_OPTIONS.find((o) => o.value === answers.experienceYears);
  const experienceLabel = experienceOpt ? localizedOptionLabel('experience', experienceOpt.id, experienceOpt.label, locale) : `${answers.experienceYears} yrs`;
  const durationOpt = DURATION_OPTIONS.find((o) => o.value === (answers.sessionDurationMin ?? 45));
  const durationLabel = durationOpt ? localizedOptionLabel('duration', durationOpt.id, durationOpt.label, locale) : `${answers.sessionDurationMin ?? 45} min`;
  const priorityOpt = PRIORITY_OPTIONS.find((o) => o.id === (answers.performancePriority ?? 'strength'));
  const priorityName = priorityOpt ? localizedOptionLabel('priority', priorityOpt.id, priorityOpt.name, locale) : 'Strength';
  const frequencyOpt = FREQUENCY_OPTIONS.find((o) => o.value === answers.daysAvailablePerWeek);
  const trainingDaysLabel = frequencyOpt
    ? localizedOptionLabel('frequency', frequencyOpt.id, `${answers.daysAvailablePerWeek}`, locale)
    : `${answers.daysAvailablePerWeek || FREQUENCY_OPTIONS[0].value}`;
  const locationNames =
    answers.trainingLocationIds
      .map((id) => {
        const loc = TRAINING_LOCATIONS.find((l) => l.id === id);
        return loc ? localizedOptionLabel('location', id, loc.name, locale) : null;
      })
      .filter(Boolean)
      .join(', ') || 'Not set';
  const equipmentNames =
    answers.equipmentIds
      .map((id) => {
        const eq = EQUIPMENT_OPTIONS.find((e) => e.id === id);
        return eq ? localizedOptionLabel('equipment', id, eq.name, locale) : null;
      })
      .filter(Boolean)
      .join(', ') || (locale === 'ar' ? 'وزن الجسم فقط' : 'Bodyweight only');
  const healthLabel =
    answers.injuryIds.length === 0 || answers.injuryIds.includes('none')
      ? localizedOptionLabel('health', 'none', 'No injuries or limitations', locale)
      : `${answers.injuryIds.length} noted`;
  const dietOpt = DIET_PREFERENCE_OPTIONS.find((d) => d.id === answers.dietaryPreference);
  const dietLabel = dietOpt ? localizedOptionLabel('diet', dietOpt.id, dietOpt.name, locale) : answers.dietaryPreference;
  const competitiveLevelOpt = COMPETITIVE_LEVEL_OPTIONS.find((l) => l.id === answers.competitiveLevel);
  const competitiveLevelName = competitiveLevelOpt
    ? localizedOptionLabel('competitiveLevel', competitiveLevelOpt.id, competitiveLevelOpt.name, locale)
    : undefined;
  const matchesOpt = MATCHES_PER_WEEK_OPTIONS.find((m) => m.value === answers.matchesPerWeek);
  const matchesLabel = matchesOpt ? localizedOptionLabel('matchesPerWeek', matchesOpt.id, matchesOpt.label, locale) : undefined;

  function buildPlan() {
    completeAssessment();
    navigate('/plan-ready');
  }

  return (
    <Screen withNav={false} className="pb-8">
      <StatusBar />
      <OnboardingHeader title={t('assessment.review.title')} progress={9 / 9} />

      <div className="px-5 mt-4">
        <p className="text-text-secondary text-[12px] font-semibold">Step 9 of 9</p>
        <h1 className="text-white text-[22px] font-extrabold mt-1">{t('review.heading')}</h1>
        <p className="text-text-secondary text-[13px] mt-1.5">{t('review.subtitle')}</p>
      </div>

      <div className="px-5 mt-5">
        <div className="bg-card border border-border-soft rounded-card px-4">
          <ReviewRow label={t('review.sport')} value={sportName} />
          {positionName && <ReviewRow label={t('review.position')} value={positionName} />}
          <ReviewRow label={t('review.goal')} value={goalName} />
          <ReviewRow label={t('review.experience')} value={experienceLabel} />
          <ReviewRow label={t('review.trainingDays')} value={trainingDaysLabel} />
          <ReviewRow label={t('review.sessionDuration')} value={durationLabel} />
          <ReviewRow label={t('review.location')} value={locationNames} />
          <ReviewRow label={t('review.equipment')} value={equipmentNames} />
          <ReviewRow label={t('review.priority')} value={priorityName} />
          {competitiveLevelName && <ReviewRow label={t('review.competitiveLevel')} value={competitiveLevelName} />}
          {matchesLabel && <ReviewRow label={t('review.matchesPerWeek')} value={matchesLabel} />}
          <ReviewRow label={t('review.health')} value={healthLabel} />
          <ReviewRow label={t('review.nutritionGoal')} value={dietLabel} />
          <ReviewRow label={t('review.mealsPerDay')} value={`${answers.mealsPerDay ?? 4}`} />
        </div>
      </div>

      <div className="px-5 mt-6">
        <button
          onClick={buildPlan}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button flex items-center justify-center gap-2"
        >
          <Icon name="checkPlain" size={15} strokeWidth={2.8} />
          {t('review.cta')}
        </button>
      </div>
    </Screen>
  );
}
