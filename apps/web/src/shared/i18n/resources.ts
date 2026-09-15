import enAlternatives from '../../locales/en/alternatives.json';
import enAuth from '../../locales/en/auth.json';
import enExperiments from '../../locales/en/experiments.json';
import enMortgage from '../../locales/en/mortgage.json';
import enPicks from '../../locales/en/picks.json';
import enCommon from '../../locales/en/common.json';
import enErrors from '../../locales/en/errors.json';
import enListings from '../../locales/en/listings.json';
import enValuation from '../../locales/en/valuation.json';
import hyAlternatives from '../../locales/hy/alternatives.json';
import hyAuth from '../../locales/hy/auth.json';
import hyExperiments from '../../locales/hy/experiments.json';
import hyMortgage from '../../locales/hy/mortgage.json';
import hyPicks from '../../locales/hy/picks.json';
import hyCommon from '../../locales/hy/common.json';
import hyErrors from '../../locales/hy/errors.json';
import hyListings from '../../locales/hy/listings.json';
import hyValuation from '../../locales/hy/valuation.json';
import ruAlternatives from '../../locales/ru/alternatives.json';
import ruAuth from '../../locales/ru/auth.json';
import ruExperiments from '../../locales/ru/experiments.json';
import ruMortgage from '../../locales/ru/mortgage.json';
import ruPicks from '../../locales/ru/picks.json';
import ruCommon from '../../locales/ru/common.json';
import ruErrors from '../../locales/ru/errors.json';
import ruListings from '../../locales/ru/listings.json';
import ruValuation from '../../locales/ru/valuation.json';

/**
 * Translations are split by feature rather than kept in one file per language,
 * so a feature owns its copy and a screen only loads what it uses.
 *
 * They are imported statically rather than fetched: the whole set is a few
 * kilobytes, and bundling them means the first paint is never a flash of
 * translation keys. Once the catalogue grows past a screenful of features this
 * becomes a per-namespace dynamic import.
 */
export const NAMESPACES = [
  'common',
  'listings',
  'valuation',
  'alternatives',
  'mortgage',
  'picks',
  'experiments',
  'auth',
  'errors',
] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE = 'common' satisfies Namespace;

export const resources = {
  en: {
    common: enCommon,
    listings: enListings,
    valuation: enValuation,
    alternatives: enAlternatives,
    mortgage: enMortgage,
    picks: enPicks,
    experiments: enExperiments,
    auth: enAuth,
    errors: enErrors,
  },
  hy: {
    common: hyCommon,
    listings: hyListings,
    valuation: hyValuation,
    alternatives: hyAlternatives,
    mortgage: hyMortgage,
    picks: hyPicks,
    experiments: hyExperiments,
    auth: hyAuth,
    errors: hyErrors,
  },
  ru: {
    common: ruCommon,
    listings: ruListings,
    valuation: ruValuation,
    alternatives: ruAlternatives,
    mortgage: ruMortgage,
    picks: ruPicks,
    experiments: ruExperiments,
    auth: ruAuth,
    errors: ruErrors,
  },
} as const;

/** The shape every locale must satisfy; English is the authoring language. */
export type TranslationResources = (typeof resources)['en'];
