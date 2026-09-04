import { describe, expect, it } from 'vitest';
import { LOCALES, TRANSLATIONS, formatTranslation, type TranslationKey } from './translations';

describe('i18n translations', () => {
  it('A/B/C: every key exists in both English and Arabic, and Arabic actually differs from English', () => {
    const enKeys = Object.keys(TRANSLATIONS.en) as TranslationKey[];
    const arKeys = Object.keys(TRANSLATIONS.ar) as TranslationKey[];
    expect(arKeys.sort()).toEqual(enKeys.sort());

    for (const key of enKeys) {
      expect(TRANSLATIONS.en[key]).toBeTruthy();
      expect(TRANSLATIONS.ar[key]).toBeTruthy();
      // Every translated string must genuinely differ — a copy-pasted English
      // fallback masquerading as Arabic would defeat the whole point.
      expect(TRANSLATIONS.ar[key]).not.toBe(TRANSLATIONS.en[key]);
    }
  });

  it('B: English is declared LTR', () => {
    expect(LOCALES.find((l) => l.id === 'en')?.dir).toBe('ltr');
  });

  it('C: Arabic is declared RTL', () => {
    expect(LOCALES.find((l) => l.id === 'ar')?.dir).toBe('rtl');
  });

  it('formatTranslation interpolates {placeholders} and leaves unknown ones literal', () => {
    expect(formatTranslation('Step {current} of {total}', { current: 2, total: 9 })).toBe('Step 2 of 9');
    expect(formatTranslation('Week {week}', {})).toBe('Week {week}');
    expect(formatTranslation('no placeholders')).toBe('no placeholders');
  });
});
