import 'i18next';
import type { DEFAULT_NAMESPACE, TranslationResources } from './resources.js';

/**
 * Teaches i18next the shape of the catalogue, so `t('listings:resultCount')` is
 * checked at compile time and a typo in a key fails `pnpm typecheck` rather than
 * rendering the key to the user.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: TranslationResources;
    returnNull: false;
  }
}
