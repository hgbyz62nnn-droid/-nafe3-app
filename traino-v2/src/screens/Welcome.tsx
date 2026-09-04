import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { useLocale } from '../domain/state/LocaleContext';

/**
 * Shown at `/` only for an athlete who hasn't completed the assessment yet
 * (see App.tsx's RootScreen). The single job here is to make the first-time
 * journey obvious and start the EXISTING assessment flow — no new assessment
 * system, no plan-generation logic of its own. "Build My Plan" (the existing
 * final assessment CTA, AssessmentNutritionPreferences.tsx) already persists
 * the profile and lets the existing Training/Nutrition engines generate the
 * plan; this screen only gets the athlete into that flow.
 */
export default function Welcome() {
  const navigate = useNavigate();
  const { t } = useLocale();

  return (
    <Screen withNav={false} className="flex flex-col">
      <StatusBar />

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-red drop-shadow-[0_0_20px_rgba(224,39,46,0.5)] mb-6">
          <Icon name="aiMascot" size={84} strokeWidth={1.4} />
        </div>

        <h1 className="text-white text-[28px] font-extrabold leading-tight">{t('welcome.headline')}</h1>
        <p className="text-text-secondary text-[14px] leading-relaxed mt-3 max-w-[300px]">{t('welcome.body')}</p>

        <div className="w-full mt-8 flex flex-col gap-3">
          <div className="flex items-center gap-2.5 text-left bg-card border border-border-soft rounded-card-sm px-4 py-3">
            <Icon name="fitness" size={17} className="text-red shrink-0" />
            <p className="text-text-secondary text-[12.5px]">{t('welcome.point.assessment')}</p>
          </div>
          <div className="flex items-center gap-2.5 text-left bg-card border border-border-soft rounded-card-sm px-4 py-3">
            <Icon name="target" size={17} className="text-red shrink-0" />
            <p className="text-text-secondary text-[12.5px]">{t('welcome.point.engine')}</p>
          </div>
          <div className="flex items-center gap-2.5 text-left bg-card border border-border-soft rounded-card-sm px-4 py-3">
            <Icon name="nutrition" size={17} className="text-red shrink-0" />
            <p className="text-text-secondary text-[12.5px]">{t('welcome.point.everything')}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pb-8">
        <button
          onClick={() => navigate('/onboarding/about')}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button"
        >
          {t('welcome.cta')}
        </button>
      </div>
    </Screen>
  );
}
