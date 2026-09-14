import enAuth from '../../locales/en/auth.json';
import enCommon from '../../locales/en/common.json';
import enErrors from '../../locales/en/errors.json';
import enListings from '../../locales/en/listings.json';
import hyAuth from '../../locales/hy/auth.json';
import hyCommon from '../../locales/hy/common.json';
import hyErrors from '../../locales/hy/errors.json';
import hyListings from '../../locales/hy/listings.json';
import ruAuth from '../../locales/ru/auth.json';
import ruCommon from '../../locales/ru/common.json';
import ruErrors from '../../locales/ru/errors.json';
import ruListings from '../../locales/ru/listings.json';

/**
 * Translations are split by feature rather than kept in one file per language,
 * so a feature owns its copy and a screen only loads what it uses.
 *
 * They are imported statically rather than fetched: the whole set is a few
 * kilobytes, and bundling them means the first paint is never a flash of
 * translation keys. Once the catalogue grows past a screenful of features this
 * becomes a per-namespace dynamic import.
 */
export const NAMESPACES = ['common', 'listings', 'auth', 'errors'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE = 'common' satisfies Namespace;

export const resources = {
  en: { common: enCommon, listings: enListings, auth: enAuth, errors: enErrors },
  hy: { common: hyCommon, listings: hyListings, auth: hyAuth, errors: hyErrors },
  ru: { common: ruCommon, listings: ruListings, auth: ruAuth, errors: ruErrors },
} as const;

/** The shape every locale must satisfy; English is the authoring language. */
export type TranslationResources = (typeof resources)['en'];
