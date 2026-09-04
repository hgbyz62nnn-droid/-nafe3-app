import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOCALES, TRANSLATIONS, formatTranslation, type Locale, type TranslationKey } from '../i18n/translations';
import { loadVersioned, saveVersioned } from './persistence';

const STORAGE_KEY = 'traino.locale';
const LOCALE_DATA_VERSION = 1;

interface StoredLocale {
  locale: Locale;
  /** Distinguishes "never picked a language" (fresh install — Language Selection
   * shows) from "explicitly picked English" (never show it again). */
  hasChosenLanguage: boolean;
}

function isStoredLocale(value: unknown): value is StoredLocale {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.locale === 'en' || v.locale === 'ar') && typeof v.hasChosenLanguage === 'boolean';
}

function loadStoredLocale(): StoredLocale {
  const result = loadVersioned<StoredLocale>({
    storageKey: STORAGE_KEY,
    currentVersion: LOCALE_DATA_VERSION,
    migrations: [],
    validate: isStoredLocale,
    fallback: () => ({ locale: 'en', hasChosenLanguage: false }),
  });
  return result.data;
}

interface LocaleContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  hasChosenLanguage: boolean;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredLocale>(loadStoredLocale);

  const dir = LOCALES.find((l) => l.id === state.locale)?.dir ?? 'ltr';

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = state.locale;
  }, [dir, state.locale]);

  function setLocale(locale: Locale) {
    const next: StoredLocale = { locale, hasChosenLanguage: true };
    setState(next);
    saveVersioned(STORAGE_KEY, LOCALE_DATA_VERSION, next);
  }

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale: state.locale,
      dir,
      hasChosenLanguage: state.hasChosenLanguage,
      setLocale,
      t: (key, vars) => formatTranslation(TRANSLATIONS[state.locale][key], vars),
    }),
    [state, dir]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}
