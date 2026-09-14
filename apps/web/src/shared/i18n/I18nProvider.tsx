import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { setActiveLocale } from './active-locale.js';
import { storeLocale } from './detect.js';
import { createI18n } from './i18n.js';
import { describeLocale, isLocale, type Locale } from './locales.js';

export interface I18nProviderProps {
  locale: Locale;
  children: ReactNode;
}

/**
 * Holds one i18next instance for the life of the application and keeps it, the
 * document and the remembered preference in step with the locale in the URL.
 *
 * Setting `lang` on the root element is not cosmetic: it is what selects the
 * Armenian and Cyrillic faces in `fonts.css`, and what tells a screen reader
 * which pronunciation rules to use.
 */
export function I18nProvider({ locale, children }: I18nProviderProps): JSX.Element {
  const [instance] = useState(() => createI18n(locale));

  useEffect(() => {
    if (instance.language !== locale) {
      void instance.changeLanguage(locale);
    }
    const root = document.documentElement;
    root.lang = locale;
    root.dir = describeLocale(locale).dir;
    storeLocale(globalThis.localStorage, locale);
    // So the API returns listing text in the language being rendered.
    setActiveLocale(locale);
  }, [instance, locale]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

/** The locale currently being rendered, read from the live i18next instance. */
export function useCurrentLocale(): Locale {
  const { i18n } = useTranslation();
  return isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
}
