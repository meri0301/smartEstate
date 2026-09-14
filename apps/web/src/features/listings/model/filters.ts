/**
 * The search screen's filter state, and its translation to and from the URL.
 *
 * Filters live in the query string rather than in component state, for the same
 * reason the locale lives in the path: a filtered search is a place, and a place
 * should be shareable, bookmarkable and survive a reload. Everything here is
 * pure, so the round trip can be tested without rendering anything.
 */
import {
  BUILDING_TYPES,
  CONDITIONS,
  LISTING_SORTS,
  type BuildingType,
  type Condition,
  type ListingSort,
} from '@smartestate/contracts';
import type { ListingsSearchFilters } from '../api/use-listings.js';

export const DEFAULT_SORT: ListingSort = 'published_desc';

/** Result cards per request. Large enough to fill a wide grid, small enough to stay quick. */
export const PAGE_SIZE = 24;

/** Slugs are supplied by the API; the shape check keeps a hand-edited URL from reaching it. */
const SLUG = /^[a-z][a-z0-9-]{1,40}$/;

export interface ListingFilterValues {
  sort: ListingSort;
  priceMin: number | undefined;
  priceMax: number | undefined;
  roomsMin: number | undefined;
  roomsMax: number | undefined;
  areaMin: number | undefined;
  yearMin: number | undefined;
  districts: string[];
  buildingTypes: BuildingType[];
  conditions: Condition[];
  hasElevator: boolean;
  hasParking: boolean;
  docsVerified: boolean;
  excludeGroundFloor: boolean;
  excludeTopFloor: boolean;
  /** "minLon,minLat,maxLon,maxLat", set when the reader searches the visible map area. */
  bbox: string | undefined;
}

export const EMPTY_FILTERS: ListingFilterValues = {
  sort: DEFAULT_SORT,
  priceMin: undefined,
  priceMax: undefined,
  roomsMin: undefined,
  roomsMax: undefined,
  areaMin: undefined,
  yearMin: undefined,
  districts: [],
  buildingTypes: [],
  conditions: [],
  hasElevator: false,
  hasParking: false,
  docsVerified: false,
  excludeGroundFloor: false,
  excludeTopFloor: false,
  bbox: undefined,
};

/** Four finite numbers, west/south/east/north, with the minimums first. */
export function isBbox(value: string): boolean {
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return false;
  }
  const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];
  return minLon < maxLon && minLat < maxLat;
}

function positiveInt(raw: string | null): number | undefined {
  if (raw === null) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function positiveNumber(raw: string | null): number | undefined {
  if (raw === null) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function flag(raw: string | null): boolean {
  return raw === 'true';
}

/** Comma-separated list, keeping only the members the API would accept. */
function list<T extends string>(raw: string | null, allowed: (value: string) => value is T): T[] {
  if (raw === null) {
    return [];
  }
  const seen = new Set<T>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (allowed(trimmed)) {
      seen.add(trimmed);
    }
  }
  return [...seen];
}

const isBuildingType = (value: string): value is BuildingType =>
  (BUILDING_TYPES as readonly string[]).includes(value);
const isCondition = (value: string): value is Condition =>
  (CONDITIONS as readonly string[]).includes(value);
const isSlug = (value: string): value is string => SLUG.test(value);

/**
 * Reads filters out of a query string, ignoring anything malformed.
 *
 * A URL is user input, and an unknown district slug or a negative price would
 * be rejected by the API and blank the whole page. Dropping the bad parameter
 * and searching with the rest is the friendlier failure.
 */
export function parseFilters(params: URLSearchParams): ListingFilterValues {
  const sort = params.get('sort');
  const bbox = params.get('bbox');
  return {
    sort:
      sort !== null && (LISTING_SORTS as readonly string[]).includes(sort)
        ? (sort as ListingSort)
        : DEFAULT_SORT,
    priceMin: positiveInt(params.get('priceMin')),
    priceMax: positiveInt(params.get('priceMax')),
    roomsMin: positiveInt(params.get('roomsMin')),
    roomsMax: positiveInt(params.get('roomsMax')),
    areaMin: positiveNumber(params.get('areaMin')),
    yearMin: positiveInt(params.get('yearMin')),
    districts: list(params.get('districts'), isSlug),
    buildingTypes: list(params.get('buildingTypes'), isBuildingType),
    conditions: list(params.get('conditions'), isCondition),
    hasElevator: flag(params.get('hasElevator')),
    hasParking: flag(params.get('hasParking')),
    docsVerified: flag(params.get('docsVerified')),
    excludeGroundFloor: flag(params.get('excludeGroundFloor')),
    excludeTopFloor: flag(params.get('excludeTopFloor')),
    bbox: bbox !== null && isBbox(bbox) ? bbox : undefined,
  };
}

/**
 * Writes filters back to a query string, omitting everything at its default so
 * an unfiltered search has a clean URL.
 */
export function toSearchParams(values: ListingFilterValues): URLSearchParams {
  const params = new URLSearchParams();
  const setNumber = (key: string, value: number | undefined): void => {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  };
  const setList = (key: string, value: readonly string[]): void => {
    if (value.length > 0) {
      params.set(key, value.join(','));
    }
  };
  const setFlag = (key: string, value: boolean): void => {
    if (value) {
      params.set(key, 'true');
    }
  };

  if (values.sort !== DEFAULT_SORT) {
    params.set('sort', values.sort);
  }
  setNumber('priceMin', values.priceMin);
  setNumber('priceMax', values.priceMax);
  setNumber('roomsMin', values.roomsMin);
  setNumber('roomsMax', values.roomsMax);
  setNumber('areaMin', values.areaMin);
  setNumber('yearMin', values.yearMin);
  setList('districts', values.districts);
  setList('buildingTypes', values.buildingTypes);
  setList('conditions', values.conditions);
  setFlag('hasElevator', values.hasElevator);
  setFlag('hasParking', values.hasParking);
  setFlag('docsVerified', values.docsVerified);
  setFlag('excludeGroundFloor', values.excludeGroundFloor);
  setFlag('excludeTopFloor', values.excludeTopFloor);
  if (values.bbox !== undefined) {
    params.set('bbox', values.bbox);
  }
  return params;
}

/**
 * Filters as the API takes them. Absent keys are omitted rather than sent as
 * undefined, because they become part of the React Query cache key.
 */
export function toQuery(values: ListingFilterValues, locale: string): ListingsSearchFilters {
  const params = toSearchParams(values);
  const query: Record<string, string | number> = { limit: PAGE_SIZE, locale };
  for (const [key, value] of params.entries()) {
    const asNumber = Number(value);
    query[key] = value !== '' && !Number.isNaN(asNumber) ? asNumber : value;
  }
  return query;
}

/** How many filters the reader has set, for the "clear" control and the mobile summary. */
export function activeFilterCount(values: ListingFilterValues): number {
  const params = toSearchParams(values);
  params.delete('sort');
  return [...params.keys()].length;
}

export function hasActiveFilters(values: ListingFilterValues): boolean {
  return activeFilterCount(values) > 0;
}
