/**
 * Enumerations shared by API and client. The value lists MUST match the enums in
 * `apps/api/prisma/schema.prisma`; the API test suite asserts that equality so the
 * two cannot drift.
 */
import { z } from 'zod';

export const ROLES = ['USER', 'AGENT', 'MODERATOR', 'ADMIN'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const LOCALES = ['hy', 'ru', 'en'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;
export const DEFAULT_LOCALE: Locale = 'hy';
export const FALLBACK_LOCALE: Locale = 'en';

/**
 * Moderation lifecycle of a listing. These are review states, not market states:
 * a sale or a reservation ends with the listing ARCHIVED.
 */
export const LISTING_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'REJECTED',
  'ARCHIVED',
] as const;
export const listingStatusSchema = z.enum(LISTING_STATUSES);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const BUILDING_TYPES = [
  'STONE',
  'PANEL',
  'MONOLITH',
  'KHRUSHCHYOVKA',
  'STALINKA',
  'NEW_BUILD',
] as const;
export const buildingTypeSchema = z.enum(BUILDING_TYPES);
export type BuildingType = z.infer<typeof buildingTypeSchema>;

export const CONDITIONS = [
  'NEEDS_REPAIR',
  'OLD_RENOVATION',
  'GOOD',
  'EURO_RENOVATION',
  'DESIGNER',
] as const;
export const conditionSchema = z.enum(CONDITIONS);
export type Condition = z.infer<typeof conditionSchema>;

export const HEATING_TYPES = ['CENTRAL_GAS', 'INDIVIDUAL_GAS_BOILER', 'ELECTRIC', 'NONE'] as const;
export const heatingTypeSchema = z.enum(HEATING_TYPES);
export type HeatingType = z.infer<typeof heatingTypeSchema>;

export const OWNERSHIP_DOCS_STATUSES = ['VERIFIED', 'UNVERIFIED'] as const;
export const ownershipDocsStatusSchema = z.enum(OWNERSHIP_DOCS_STATUSES);
export type OwnershipDocsStatus = z.infer<typeof ownershipDocsStatusSchema>;

export const CURRENCIES = ['AMD', 'USD', 'EUR'] as const;
export const currencySchema = z.enum(CURRENCIES);
export type Currency = z.infer<typeof currencySchema>;

export const DISTRICT_KINDS = ['CITY_DISTRICT', 'TOWN'] as const;
export const districtKindSchema = z.enum(DISTRICT_KINDS);
export type DistrictKind = z.infer<typeof districtKindSchema>;

export const MEDIA_KINDS = ['PHOTO', 'FLOOR_PLAN', 'VIDEO'] as const;
export const mediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKind = z.infer<typeof mediaKindSchema>;

/** What a reader did with a listing. Implicit feedback, graded when it is read back. */
export const INTERACTION_TYPES = [
  'VIEW',
  'DWELL',
  'FAVORITE',
  'UNFAVORITE',
  'COMPARE',
  'DISMISS',
  'CONTACT',
] as const;
export const interactionTypeSchema = z.enum(INTERACTION_TYPES);
export type InteractionType = z.infer<typeof interactionTypeSchema>;
