import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { BottomNav } from '../components/ui/BottomNav';
import { getAiCoachReply, getFallbackReply } from '../domain/engine/aiCoachEngine';
import type { AiCoachIntent, AiCoachReply } from '../domain/engine/types';
import { useProfile } from '../domain/state/ProfileContext';
import { useWeeklyCoaching } from '../domain/state/WeeklyCoachingContext';
import { useDailyReadiness } from '../domain/state/DailyReadinessContext';
import { useLogs } from '../domain/state/LogContext';
import { useExercisePreferences } from '../domain/state/ExercisePreferenceContext';
import { useFoodPreferences } from '../domain/state/FoodPreferenceContext';
import { generateTodayWorkout } from '../domain/engine/planEngine';
import { computeProgressionInfo } from '../domain/engine/progressionEngine';
import { derivePreferenceSignals, deriveRecentlyUsedIds } from '../domain/exercise/preferences';
import type { AthleteConstraints } from '../domain/exercise/matchingEngine';
import type { ExerciseProgressionContext } from '../domain/engine/progressionIntegration';
import { deriveNutritionProfile } from '../domain/nutrition/profile';
import { buildDailyPlan } from '../domain/nutrition/mealBuilder';
import { deriveFoodPreferenceSignals, deriveRecentlyUsedFoodIds } from '../domain/nutrition/preferences';
import { computeDetailedNutritionAdherence } from '../domain/nutrition/adherence';
import type { FoodAthleteConstraints } from '../domain/nutrition/matchingEngine';
import type { MealRole } from '../domain/nutrition/types';
import { getFood } from '../domain/nutrition/registry';

const SUGGESTIONS: { label: string; intent: AiCoachIntent }[] = [
  { label: 'How ready am I today?', intent: 'how_ready_am_i' },
  { label: 'Should I train today?', intent: 'should_i_train_today' },
  { label: "Adjust today's workout", intent: 'adjust_todays_workout' },
  { label: 'I have pain', intent: 'have_pain' },
  { label: "I'm traveling", intent: 'traveling' },
  { label: 'Replace an exercise', intent: 'replace_exercise' },
  { label: 'Missed a workout', intent: 'missed_workout' },
  { label: 'Ask about nutrition', intent: 'ask_about_nutrition' },
  { label: 'Why did my consistency drop?', intent: 'why_consistency_dropped' },
  { label: "What's changing next week?", intent: 'whats_next_week_change' },
  { label: 'Why was my workout reduced?', intent: 'why_workout_reduced' },
  { label: 'Why did my weight increase?', intent: 'why_weight_increased' },
  { label: "Why didn't I progress?", intent: 'why_no_progression' },
  { label: "What's changed from last week?", intent: 'whats_changed_from_last_week' },
  { label: 'What should I aim for next time?', intent: 'what_should_i_aim_for' },
  { label: 'Why did you choose this exercise?', intent: 'why_this_exercise' },
  { label: 'What muscles does this train?', intent: 'what_muscles_does_this_train' },
  { label: "What's an easier version?", intent: 'easier_version' },
  { label: "What's a harder version?", intent: 'harder_version' },
  { label: "Why can't I use other exercises?", intent: 'why_limited_alternatives' },
  { label: 'What should I eat today?', intent: 'what_should_i_eat_today' },
  { label: 'What are my calories?', intent: 'what_are_my_calories' },
  { label: 'Why did you choose these foods?', intent: 'why_these_foods' },
  { label: 'Replace this food', intent: 'replace_food' },
  { label: "I don't like this meal", intent: 'replace_food' },
  { label: 'How is my nutrition this week?', intent: 'how_is_my_nutrition_this_week' },
];

/** Intents that read structured Weekly Coaching / Daily Readiness / Progression /
 * Exercise Intelligence context — everything else resolves from a fixed reply table alone. */
const CONTEXTUAL_INTENTS: AiCoachIntent[] = [
  'why_consistency_dropped',
  'whats_next_week_change',
  'why_workout_reduced',
  'how_ready_am_i',
  'should_i_train_today',
  'why_weight_increased',
  'why_no_progression',
  'whats_changed_from_last_week',
  'what_should_i_aim_for',
  'replace_exercise',
  'why_this_exercise',
  'what_muscles_does_this_train',
  'easier_version',
  'harder_version',
  'why_limited_alternatives',
  'what_should_i_eat_today',
  'what_are_my_calories',
  'why_these_foods',
  'replace_food',
  'how_is_my_nutrition_this_week',
];

type Message = { role: 'user'; text: string } | ({ role: 'ai' } & AiCoachReply);

const INITIAL_MESSAGES: Message[] = [
  { role: 'user', text: "I'm feeling tired today" },
  { role: 'ai', ...getAiCoachReply('feeling_tired') },
];

export default function AiCoach() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, setActiveAdjustment, planStartDate } = useProfile();
  const { getLatestRecord } = useWeeklyCoaching();
  const { getTodayRecord, getRecord } = useDailyReadiness();
  const { getExerciseHistory, getLogsSince, getRecentLogs, getAllNutritionLogs } = useLogs();
  const { replacementCounts } = useExercisePreferences();
  const { replacementCounts: foodReplacementCounts, explicitSignals: foodExplicitSignals } = useFoodPreferences();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState('');

  // Set when the athlete reached AI Coach from a specific exercise's detail view
  // (ExerciseDetailPanel's "Ask AI Coach" button) — focuses the exercise-intelligence
  // intents on that exercise instead of falling back to today's first one.
  const navState = location.state as { exerciseName?: string; foodId?: string; foodRole?: MealRole } | null;
  const focusedExerciseName = navState?.exerciseName;
  const focusedFoodId = navState?.foodId;
  const focusedFoodRole = navState?.foodRole;

  const recentExerciseLogs = getRecentLogs(90).flatMap((day) => day.exerciseLogs ?? []);
  const athleteConstraints: AthleteConstraints = {
    availableEquipment: profile.answers.equipmentIds,
    injuryIds: profile.answers.injuryIds,
    sport: profile.answers.sport,
    athleteLevel: profile.level,
    preferenceByExerciseId: derivePreferenceSignals(recentExerciseLogs, replacementCounts),
    recentlyUsedExerciseIds: deriveRecentlyUsedIds(recentExerciseLogs),
  };

  const allNutritionLogs = getAllNutritionLogs();
  const nutritionProfile = deriveNutritionProfile(profile.answers, {
    dislikedFoodIds: [],
    likedFoodIds: Object.entries(foodExplicitSignals)
      .filter(([, s]) => s === 'liked')
      .map(([id]) => id),
    isTrainingDay: true,
  });
  const dailyPlan = buildDailyPlan(nutritionProfile, profile.nutrition);
  const foodAthleteConstraints: FoodAthleteConstraints = {
    dietaryPreference: profile.answers.dietaryPreference,
    allergyIds: profile.answers.allergyIds,
    budgetTier: profile.answers.budgetTier,
    preferenceByFoodId: deriveFoodPreferenceSignals(allNutritionLogs, foodReplacementCounts, foodExplicitSignals),
    recentlyUsedFoodIds: deriveRecentlyUsedFoodIds(allNutritionLogs),
  };
  const nutritionAdherence = computeDetailedNutritionAdherence(getRecentLogs(7), { calories: profile.nutrition.calories, proteinG: profile.nutrition.proteinG });

  function todaysProgressionDecisions() {
    const progressionLogs = planStartDate ? getLogsSince(planStartDate) : [];
    const { progressionWeek } = computeProgressionInfo(planStartDate, progressionLogs, profile.answers.daysAvailablePerWeek);
    const progressionContext: ExerciseProgressionContext = {
      getHistory: getExerciseHistory,
      getReadinessStatus: (date) => getRecord(date)?.status ?? null,
    };
    const workout = generateTodayWorkout(profile, undefined, progressionWeek, progressionContext);
    return workout.exercises.map((ex) => ex.progression).filter((d): d is NonNullable<typeof d> => !!d);
  }

  function handleSuggestion(label: string, intent: AiCoachIntent) {
    const reply = CONTEXTUAL_INTENTS.includes(intent)
      ? getAiCoachReply(intent, {
          latestRecord: getLatestRecord(),
          todayReadiness: getTodayRecord() ?? null,
          todaysProgressionDecisions: todaysProgressionDecisions(),
          focusedExerciseName,
          athleteConstraints,
          dailyPlan,
          nutritionTargets: profile.nutrition,
          focusedFoodId,
          focusedFoodRole,
          foodAthleteConstraints,
          nutritionAdherence,
        })
      : getAiCoachReply(intent);
    setMessages((prev) => [...prev, { role: 'user', text: label }, { role: 'ai', ...reply }]);
  }

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: 'user', text }, { role: 'ai', ...getFallbackReply() }]);
    setDraft('');
  }

  function handleCta(msg: Message & { role: 'ai' }) {
    if (msg.adjustment) {
      setActiveAdjustment(msg.adjustment);
      navigate('/todays-workout');
    } else if (msg.ctaLabel === 'OPEN NUTRITION' || msg.ctaLabel === 'CHOOSE EXERCISE') {
      navigate(msg.ctaLabel === 'OPEN NUTRITION' ? '/nutrition' : '/todays-workout');
    } else if (msg.ctaLabel === 'VIEW WEEKLY REPORT') {
      navigate('/weekly-report');
    } else if (msg.ctaLabel === 'CHECK IN') {
      navigate('/daily-check-in');
    } else if (msg.ctaLabel === "VIEW TODAY'S WORKOUT") {
      navigate('/todays-workout');
    }
  }

  return (
    <Screen className="pb-3">
      <StatusBar />

      <div className="flex items-center px-4 mt-1">
        <Link to="/" className="w-8 h-8 flex items-center justify-center -ml-1.5 shrink-0">
          <Icon name="chevronLeft" size={22} className="text-white" strokeWidth={2} />
        </Link>
        <h1 className="flex-1 text-center text-white text-[15px] font-extrabold tracking-wide">
          AI COACH
        </h1>
        <div className="flex items-center gap-3 shrink-0">
          <Icon name="sliders" size={19} className="text-white" />
          <Icon name="dotsVertical" size={19} className="text-white" />
        </div>
      </div>

      {(focusedExerciseName || focusedFoodId) && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-card border border-border-soft rounded-card-sm px-3.5 py-2">
          <Icon name="aiMascot" size={14} className="text-red shrink-0" />
          <p className="flex-1 text-text-secondary text-[11.5px]">
            Asking about{' '}
            <span className="text-white font-semibold">
              {focusedExerciseName ?? getFood(focusedFoodId!)?.displayName ?? focusedFoodId}
            </span>
          </p>
        </div>
      )}

      <div className="px-4 mt-4 flex flex-col gap-3">
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="self-end max-w-[80%] bg-red rounded-2xl rounded-br-md px-3.5 py-2.5">
              <p className="text-white text-[13.5px] leading-snug">{msg.text}</p>
              <p className="text-white/70 text-[10px] text-right mt-1">9:41 AM</p>
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-3">
              <div className="flex items-start gap-2 max-w-[86%]">
                <span className="w-8 h-8 rounded-[10px] bg-red flex items-center justify-center shrink-0 mt-0.5">
                  <Icon name="aiMascot" size={17} className="text-bg" strokeWidth={1.8} />
                </span>
                <div className="bg-card rounded-2xl rounded-bl-md px-3.5 py-2.5">
                  <p className="text-white text-[13.5px] leading-snug">{msg.message}</p>
                  <p className="text-text-muted text-[10px] text-right mt-1">9:41 AM</p>
                </div>
              </div>

              {msg.adjustmentSummary && (
                <div className="bg-card border border-border-soft rounded-2xl p-4">
                  <p className="text-white text-[11.5px] font-extrabold tracking-wide">
                    TRAINO AI ADJUSTMENT
                  </p>
                  <div className="flex flex-col gap-2.5 mt-3">
                    {msg.adjustmentSummary.map((item) => (
                      <div key={item} className="flex items-center gap-2.5">
                        <span className="w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full bg-success flex items-center justify-center">
                          <Icon name="checkPlain" size={11} className="text-bg" strokeWidth={2.8} />
                        </span>
                        <span className="text-white text-[13px] font-medium">{item}</span>
                      </div>
                    ))}
                  </div>
                  {msg.ctaLabel && (
                    <button
                      onClick={() => handleCta(msg)}
                      className="w-full bg-red rounded-button py-3 text-white font-extrabold text-[13px] tracking-wide mt-4 shadow-button"
                    >
                      {msg.ctaLabel}
                    </button>
                  )}
                </div>
              )}

              {!msg.adjustmentSummary && msg.ctaLabel && (
                <button
                  onClick={() => handleCta(msg)}
                  className="self-start ml-10 border border-red/50 rounded-chip px-4 py-2 text-red text-[12.5px] font-bold"
                >
                  {msg.ctaLabel}
                </button>
              )}
            </div>
          )
        )}
      </div>

      <div className="px-4 mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={`${s.intent}-${i}`}
            onClick={() => handleSuggestion(s.label, s.intent)}
            className="border border-border-soft rounded-chip px-3.5 py-2 text-text-secondary text-[12px] font-medium bg-card-nested"
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4 flex items-center gap-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask anything..."
          className="flex-1 bg-card border border-border-soft rounded-chip px-4 py-3 text-white text-[13px] placeholder:text-text-muted outline-none focus:border-red"
        />
        <button
          onClick={handleSend}
          className="w-11 h-11 min-w-[44px] rounded-full bg-red flex items-center justify-center shadow-button"
        >
          <Icon name="send" size={16} className="text-white" />
        </button>
      </div>

      <BottomNav variant="ai-coach" />
    </Screen>
  );
}
