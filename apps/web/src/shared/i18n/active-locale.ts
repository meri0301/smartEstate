import { DEFAULT_LOCALE, type Locale } from './locales.js';

/**
 * The locale currently being rendered, readable from outside React.
 *
 * The API returns listing text in whichever language the request asks for, so
 * the fetch client has to send one — but the client is a module-level singleton
 * and cannot call a hook. `I18nProvider` publishes the active locale here as it
 * changes, and the client reads it on each request.
 */
let active: Locale = DEFAULT_LOCALE;

export function setActiveLocale(locale: Locale): void {
  active = locale;
}

export function getActiveLocale(): Locale {
  return active;
}
