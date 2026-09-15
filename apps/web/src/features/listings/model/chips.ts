/**
 * The active filters, as things a reader can see and remove.
 *
 * The brief's requirement for the natural-language search is that whatever was
 * understood is always shown and always correctable. Deriving the chips from the
 * filters that are actually applied, rather than from what the parser returned,
 * is what makes that true in both directions: a filter set by clicking looks
 * exactly like one set by typing, and removing either works the same way.
 *
 * Pure, so the labelling and the removal can be tested without rendering.
 */
import type { ParsedFilters } from '@smartestate/contracts';
import { EMPTY_FILTERS, type ListingFilterValues } from './filters.js';

export interface FilterChip {
  /** Stable across renders, and unique within one chip list. */
  id: string;
  label: string;
  /** The filters with this chip taken out. */
  remove: () => ListingFilterValues;
}

export interface ChipLabels {
  /** Translates a key with parameters, i.e. i18next's `t`. */
  t: (key: string, params?: Record<string, unknown>) => string;
  /** Formats a price for display. */
  price: (amount: number) => string;
  /** Formats a floor area for display. */
  area: (value: number) => string;
  /** The reader's name for a district slug, or the slug when it is unknown. */
  district: (slug: string) => string;
}

/** Every applied filter, in the order a person would read them. */
export function toChips(values: ListingFilterValues, labels: ChipLabels): FilterChip[] {
  const chips: FilterChip[] = [];
  const { t } = labels;

  if (values.priceMin !== undefined) {
    chips.push({
      id: 'priceMin',
      label: t('chips.priceFrom', { price: labels.price(values.priceMin) }),
      remove: () => ({ ...values, priceMin: undefined }),
    });
  }
  if (values.priceMax !== undefined) {
    chips.push({
      id: 'priceMax',
      label: t('chips.priceTo', { price: labels.price(values.priceMax) }),
      remove: () => ({ ...values, priceMax: undefined }),
    });
  }

  // An exact room count is one chip, not two: "2 rooms" is what was asked for,
  // and offering to remove half of it would be nonsense.
  if (
    values.roomsMin !== undefined &&
    values.roomsMax !== undefined &&
    values.roomsMin === values.roomsMax
  ) {
    chips.push({
      id: 'rooms',
      label: t('roomCount', { count: values.roomsMin }),
      remove: () => ({ ...values, roomsMin: undefined, roomsMax: undefined }),
    });
  } else {
    if (values.roomsMin !== undefined) {
      chips.push({
        id: 'roomsMin',
        label: t('chips.roomsFrom', { count: values.roomsMin }),
        remove: () => ({ ...values, roomsMin: undefined }),
      });
    }
    if (values.roomsMax !== undefined) {
      chips.push({
        id: 'roomsMax',
        label: t('chips.roomsTo', { count: values.roomsMax }),
        remove: () => ({ ...values, roomsMax: undefined }),
      });
    }
  }

  if (values.areaMin !== undefined) {
    chips.push({
      id: 'areaMin',
      label: t('chips.areaFrom', { area: labels.area(values.areaMin) }),
      remove: () => ({ ...values, areaMin: undefined }),
    });
  }
  if (values.areaMax !== undefined) {
    chips.push({
      id: 'areaMax',
      label: t('chips.areaTo', { area: labels.area(values.areaMax) }),
      remove: () => ({ ...values, areaMax: undefined }),
    });
  }
  if (values.yearMin !== undefined) {
    chips.push({
      id: 'yearMin',
      label: t('chips.builtFrom', { year: values.yearMin }),
      remove: () => ({ ...values, yearMin: undefined }),
    });
  }

  for (const slug of values.districts) {
    chips.push({
      id: `district:${slug}`,
      label: labels.district(slug),
      remove: () => ({ ...values, districts: values.districts.filter((item) => item !== slug) }),
    });
  }
  for (const type of values.buildingTypes) {
    chips.push({
      id: `buildingType:${type}`,
      label: t(`buildingType.${type}`),
      remove: () => ({
        ...values,
        buildingTypes: values.buildingTypes.filter((item) => item !== type),
      }),
    });
  }
  for (const condition of values.conditions) {
    chips.push({
      id: `condition:${condition}`,
      label: t(`condition.${condition}`),
      remove: () => ({
        ...values,
        conditions: values.conditions.filter((item) => item !== condition),
      }),
    });
  }

  for (const flag of [
    'hasElevator',
    'hasParking',
    'docsVerified',
    'excludeGroundFloor',
    'excludeTopFloor',
  ] as const) {
    if (values[flag]) {
      chips.push({
        id: flag,
        label: t(`filters.${flag}`),
        remove: () => ({ ...values, [flag]: false }),
      });
    }
  }

  return chips;
}

/**
 * Applies a parse to the filters already in the URL.
 *
 * The parse replaces rather than merges. Someone who types a new sentence is
 * describing what they want now, and quietly keeping a district from the last
 * search would produce results neither the old sentence nor the new one asked
 * for. The sort order is kept, because it is not part of the sentence.
 */
export function applyParsedFilters(
  parsed: ParsedFilters,
  current: ListingFilterValues,
): ListingFilterValues {
  return {
    ...EMPTY_FILTERS,
    sort: current.sort,
    priceMin: parsed.priceMin,
    priceMax: parsed.priceMax,
    roomsMin: parsed.roomsMin,
    roomsMax: parsed.roomsMax,
    areaMin: parsed.areaMin,
    areaMax: parsed.areaMax,
    districts: parsed.districts ?? [],
    buildingTypes: parsed.buildingTypes ?? [],
    conditions: parsed.conditions ?? [],
    excludeGroundFloor: parsed.excludeGroundFloor ?? false,
    excludeTopFloor: parsed.excludeTopFloor ?? false,
    hasElevator: parsed.hasElevator ?? false,
    hasParking: parsed.hasParking ?? false,
  };
}
