export {
  detectLocale,
  LOCALE_STORAGE_KEY,
  localeFromPath,
  storeLocale,
  withLocalePath,
  type DetectionInput,
  type DetectionResult,
} from './detect.js';
export {
  formatAmd,
  formatArea,
  formatDate,
  formatList,
  formatNumber,
  formatPercent,
  formatPricePerSqm,
  formatRelativeTime,
  type CurrencyOptions,
  type DateStyle,
} from './formatters.js';
export { createI18n } from './i18n.js';
export { I18nProvider, useCurrentLocale, type I18nProviderProps } from './I18nProvider.jsx';
export {
  DEFAULT_LOCALE,
  describeLocale,
  FALLBACK_LOCALE,
  intlTag,
  isLocale,
  LOCALE_DESCRIPTORS,
  LOCALES,
  normaliseLocale,
  type Locale,
  type LocaleDescriptor,
} from './locales.js';
export {
  DEFAULT_NAMESPACE,
  NAMESPACES,
  resources,
  type Namespace,
  type TranslationResources,
} from './resources.js';
