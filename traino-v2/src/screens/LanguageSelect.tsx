import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/ui/Screen';
import { StatusBar } from '../components/ui/StatusBar';
import { Icon } from '../components/ui/Icon';
import { useLocale } from '../domain/state/LocaleContext';
import { LOCALES } from '../domain/i18n/translations';

/**
 * The very first screen a fresh install ever sees (spec: LANGUAGE ->
 * WELCOME -> CREATE MY PLAN -> ...). Picking a language persists it
 * (LocaleContext) and never shows this screen again for this athlete —
 * App.tsx's RootScreen gates on `hasChosenLanguage`, exactly the same
 * pattern already used for `hasCompletedAssessment`.
 */
export default function LanguageSelect() {
  const navigate = useNavigate();
  const { locale, setLocale, t } = useLocale();

  function choose(id: 'en' | 'ar') {
    setLocale(id);
    navigate('/', { replace: true });
  }

  return (
    <Screen withNav={false} className="flex flex-col">
      <StatusBar />

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-red drop-shadow-[0_0_20px_rgba(224,39,46,0.5)] mb-6">
          <Icon name="aiMascot" size={64} strokeWidth={1.4} />
        </div>
        <h1 className="text-white text-[24px] font-extrabold leading-tight">{t('language.title')}</h1>
        <p className="text-text-secondary text-[13px] leading-relaxed mt-2 max-w-[280px]">
          {t('language.subtitle')}
        </p>

        <div className="w-full mt-8 flex flex-col gap-3">
          {LOCALES.map((l) => {
            const active = locale === l.id;
            return (
              <button
                key={l.id}
                onClick={() => choose(l.id)}
                className={`relative flex items-center justify-center gap-2.5 rounded-card-sm border-2 px-4 py-4 bg-card ${
                  active ? 'border-red shadow-card-red' : 'border-border-soft'
                }`}
              >
                <span className="text-white text-[16px] font-bold">{l.nativeName}</span>
                {active && (
                  <span className="absolute top-2.5 right-2.5 w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full bg-red flex items-center justify-center">
                    <Icon name="checkPlain" size={10} className="text-white" strokeWidth={2.8} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 pb-8">
        <button
          onClick={() => choose(locale)}
          className="w-full bg-red rounded-button py-4 text-white font-extrabold text-[15px] tracking-wide shadow-button"
        >
          {t('language.continue')}
        </button>
      </div>
    </Screen>
  );
}
