/**
 * Drift guard: the enum value lists published in @smartestate/contracts must equal
 * the enums generated from prisma/schema.prisma. A mismatch would let the API
 * accept a value the database rejects (or vice versa).
 */
import {
  BUILDING_TYPES,
  CONDITIONS,
  CURRENCIES,
  DISTRICT_KINDS,
  HEATING_TYPES,
  INTERACTION_TYPES,
  LISTING_STATUSES,
  LOCALES,
  MEDIA_KINDS,
  OWNERSHIP_DOCS_STATUSES,
  ROLES,
} from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import {
  BuildingType,
  Condition,
  Currency,
  DistrictKind,
  HeatingType,
  InteractionType,
  ListingStatus,
  Locale,
  MediaKind,
  OwnershipDocsStatus,
  Role,
} from '../generated/prisma/enums.js';

const pairs: [name: string, contracts: readonly string[], prisma: Record<string, string>][] = [
  ['Role', ROLES, Role],
  ['Locale', LOCALES, Locale],
  ['ListingStatus', LISTING_STATUSES, ListingStatus],
  ['BuildingType', BUILDING_TYPES, BuildingType],
  ['Condition', CONDITIONS, Condition],
  ['HeatingType', HEATING_TYPES, HeatingType],
  ['InteractionType', INTERACTION_TYPES, InteractionType],
  ['OwnershipDocsStatus', OWNERSHIP_DOCS_STATUSES, OwnershipDocsStatus],
  ['Currency', CURRENCIES, Currency],
  ['DistrictKind', DISTRICT_KINDS, DistrictKind],
  ['MediaKind', MEDIA_KINDS, MediaKind],
];

describe('contracts enums mirror the Prisma schema', () => {
  for (const [name, contracts, prisma] of pairs) {
    it(name, () => {
      expect([...contracts].sort()).toEqual(Object.values(prisma).sort());
    });
  }
});
