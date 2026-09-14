import i18next, { type i18n as I18nInstance } from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';
import { FALLBACK_LOCALE, intlTag, isLocale, type Locale } from './locales.js';
import { DEFAULT_NAMESPACE, NAMESPACES, resources } from './resources.js';

/**
 * Builds an i18next instance for one locale.
 *
 * Messages are ICU MessageFormat rather than i18next's own `_plural` key
 * suffixes, because the suffix scheme cannot express Russian, which needs four
 * plural categories, and gets Armenian wrong, where zero takes the singular.
 * ICU defers to `Intl.PluralRules`, so every language gets the CLDR rules.
 *
 * `parseLngForICU` widens the bare language to a regional tag before it reaches
 * `Intl`: `hy` alone would format numbers and dates with the root locale's
 * conventions rather than Armenia's.
 *
 * A fresh instance per call keeps tests isolated and lets Storybook render
 * several languages on one page.
 */
export function createI18n(locale: Locale): I18nInstance {
  const instance = i18next.createInstance();
  void instance
    .use(new ICU({ parseLngForICU: (lng) => (isLocale(lng) ? intlTag(lng) : lng) }))
    .use(initReactI18next)
    .init({
      resources,
      lng: locale,
      fallbackLng: FALLBACK_LOCALE,
      supportedLngs: Object.keys(resources),
      ns: [...NAMESPACES],
      defaultNS: DEFAULT_NAMESPACE,
      // React escapes for us; escaping here would double-encode.
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  return instance;
}
