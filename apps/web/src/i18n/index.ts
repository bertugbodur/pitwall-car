import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

export type Language = 'tr' | 'en';

void i18next.use(initReactI18next).init({
  lng: 'tr',
  fallbackLng: 'en',
  resources: { tr: {}, en: {} },
  interpolation: { escapeValue: false },
});

export function setLanguage(language: Language): void {
  document.documentElement.lang = language;
  void i18next.changeLanguage(language);
}

/**
 * Registers the strings of one feature next to the feature itself. The English table
 * must have exactly the keys of the Turkish one, checked by the compiler.
 */
export function defineStrings<T extends Record<string, string>>(namespace: string, tr: T, en: Record<keyof T, string>) {
  i18next.addResourceBundle('tr', namespace, tr);
  i18next.addResourceBundle('en', namespace, en);
  return function useStrings() {
    const { t } = useTranslation(namespace);
    // Keys are checked here; i18next's own generic inference cannot follow a dynamic namespace.
    const translate = t as unknown as (key: string, values?: object) => string;
    return (key: keyof T & string, values?: Record<string, string | number>): string => translate(key, values);
  };
}

export const useLanguage = (): Language => (useTranslation().i18n.language === 'en' ? 'en' : 'tr');
