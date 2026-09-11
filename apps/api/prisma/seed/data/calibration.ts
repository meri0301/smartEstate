/**
 * Market calibration for the synthetic Yerevan dataset.
 *
 * ASSUMPTION (documented for the thesis): the medians below approximate 2025
 * asking prices per m² observed on public Armenian listing portals, rounded to
 * the nearest 10 000 AMD. They are synthetic-data parameters, not measured
 * statistics, and no live source is scraped. Building-type mixes reflect the
 * dominant housing stock of each district (Soviet panel estates in Nor Nork and
 * Ajapnyak, tuff-stone and Stalin-era blocks in Kentron and Arabkir, new
 * monolith construction concentrated in the centre and Arabkir).
 */
import type { BuildingType } from '../../../src/generated/prisma/enums.js';

/** Seed for the deterministic RNG; change it to generate a different but equally reproducible dataset. */
export const SEED_RNG_SEED = 20_260_911;

/** Fixed "today" so generated dates never depend on when the seed runs. */
export const SEED_REFERENCE_DATE = new Date('2026-09-01T00:00:00.000Z');

export const SEED_SOURCE = 'seed';

export interface DistrictCalibration {
  slug: string;
  listingCount: number;
  medianPricePerSqmAmd: number;
  /** Sigma of the log-normal noise applied on top of the structural price model. */
  priceNoiseSigma: number;
  buildingTypeMix: readonly (readonly [BuildingType, number])[];
}

export const DISTRICT_CALIBRATION: readonly DistrictCalibration[] = [
  {
    slug: 'kentron',
    listingCount: 45,
    medianPricePerSqmAmd: 1_150_000,
    priceNoiseSigma: 0.14,
    buildingTypeMix: [
      ['STONE', 40],
      ['STALINKA', 15],
      ['NEW_BUILD', 25],
      ['MONOLITH', 15],
      ['PANEL', 3],
      ['KHRUSHCHYOVKA', 2],
    ],
  },
  {
    slug: 'arabkir',
    listingCount: 40,
    medianPricePerSqmAmd: 900_000,
    priceNoiseSigma: 0.12,
    buildingTypeMix: [
      ['STONE', 45],
      ['STALINKA', 8],
      ['NEW_BUILD', 18],
      ['MONOLITH', 12],
      ['PANEL', 10],
      ['KHRUSHCHYOVKA', 7],
    ],
  },
  {
    slug: 'kanaker-zeytun',
    listingCount: 25,
    medianPricePerSqmAmd: 720_000,
    priceNoiseSigma: 0.12,
    buildingTypeMix: [
      ['STONE', 40],
      ['PANEL', 20],
      ['KHRUSHCHYOVKA', 15],
      ['NEW_BUILD', 15],
      ['MONOLITH', 10],
    ],
  },
  {
    slug: 'davtashen',
    listingCount: 20,
    medianPricePerSqmAmd: 700_000,
    priceNoiseSigma: 0.11,
    buildingTypeMix: [
      ['PANEL', 45],
      ['STONE', 20],
      ['NEW_BUILD', 20],
      ['MONOLITH', 15],
    ],
  },
  {
    slug: 'ajapnyak',
    listingCount: 30,
    medianPricePerSqmAmd: 620_000,
    priceNoiseSigma: 0.11,
    buildingTypeMix: [
      ['PANEL', 45],
      ['STONE', 25],
      ['KHRUSHCHYOVKA', 10],
      ['NEW_BUILD', 12],
      ['MONOLITH', 8],
    ],
  },
  {
    slug: 'avan',
    listingCount: 15,
    medianPricePerSqmAmd: 600_000,
    priceNoiseSigma: 0.11,
    buildingTypeMix: [
      ['PANEL', 40],
      ['STONE', 30],
      ['NEW_BUILD', 15],
      ['MONOLITH', 10],
      ['KHRUSHCHYOVKA', 5],
    ],
  },
  {
    slug: 'nor-nork',
    listingCount: 35,
    medianPricePerSqmAmd: 560_000,
    priceNoiseSigma: 0.1,
    buildingTypeMix: [
      ['PANEL', 55],
      ['KHRUSHCHYOVKA', 15],
      ['STONE', 15],
      ['NEW_BUILD', 10],
      ['MONOLITH', 5],
    ],
  },
  {
    slug: 'malatia-sebastia',
    listingCount: 30,
    medianPricePerSqmAmd: 560_000,
    priceNoiseSigma: 0.11,
    buildingTypeMix: [
      ['PANEL', 40],
      ['STONE', 25],
      ['KHRUSHCHYOVKA', 15],
      ['NEW_BUILD', 12],
      ['MONOLITH', 8],
    ],
  },
  {
    slug: 'erebuni',
    listingCount: 25,
    medianPricePerSqmAmd: 520_000,
    priceNoiseSigma: 0.11,
    buildingTypeMix: [
      ['STONE', 35],
      ['PANEL', 30],
      ['KHRUSHCHYOVKA', 20],
      ['NEW_BUILD', 10],
      ['MONOLITH', 5],
    ],
  },
  {
    slug: 'shengavit',
    listingCount: 20,
    medianPricePerSqmAmd: 500_000,
    priceNoiseSigma: 0.11,
    buildingTypeMix: [
      ['PANEL', 35],
      ['STONE', 30],
      ['KHRUSHCHYOVKA', 20],
      ['NEW_BUILD', 10],
      ['MONOLITH', 5],
    ],
  },
  {
    slug: 'nork-marash',
    listingCount: 10,
    medianPricePerSqmAmd: 650_000,
    priceNoiseSigma: 0.12,
    buildingTypeMix: [
      ['STONE', 55],
      ['NEW_BUILD', 20],
      ['MONOLITH', 15],
      ['PANEL', 10],
    ],
  },
  {
    slug: 'nubarashen',
    listingCount: 5,
    medianPricePerSqmAmd: 340_000,
    priceNoiseSigma: 0.1,
    buildingTypeMix: [
      ['PANEL', 50],
      ['STONE', 30],
      ['KHRUSHCHYOVKA', 20],
    ],
  },
];

export const SEED_LISTING_TOTAL = DISTRICT_CALIBRATION.reduce((sum, d) => sum + d.listingCount, 0);

export interface BuildingTypeProfile {
  constructionYear: readonly [min: number, max: number];
  totalFloors: readonly [min: number, max: number];
  ceilingHeight: readonly [min: number, max: number];
}

export const BUILDING_TYPE_PROFILES: Readonly<Record<BuildingType, BuildingTypeProfile>> = {
  STALINKA: { constructionYear: [1935, 1956], totalFloors: [3, 5], ceilingHeight: [3.0, 3.4] },
  KHRUSHCHYOVKA: { constructionYear: [1958, 1972], totalFloors: [4, 5], ceilingHeight: [2.5, 2.7] },
  PANEL: { constructionYear: [1965, 1992], totalFloors: [9, 16], ceilingHeight: [2.6, 2.8] },
  STONE: { constructionYear: [1950, 1998], totalFloors: [4, 9], ceilingHeight: [2.8, 3.1] },
  MONOLITH: { constructionYear: [2005, 2023], totalFloors: [10, 20], ceilingHeight: [2.9, 3.2] },
  NEW_BUILD: { constructionYear: [2019, 2026], totalFloors: [8, 18], ceilingHeight: [3.0, 3.3] },
};

/** Share of listings by room count (Yerevan resale market is dominated by 2–3 rooms). */
export const ROOM_DISTRIBUTION: readonly (readonly [rooms: number, weight: number])[] = [
  [1, 20],
  [2, 35],
  [3, 30],
  [4, 12],
  [5, 3],
];

/** Total area range (m²) by room count for Soviet-era stock; new builds run ~15 % larger. */
export const AREA_BY_ROOMS: Readonly<Record<number, readonly [min: number, max: number]>> = {
  1: [32, 48],
  2: [45, 70],
  3: [65, 100],
  4: [90, 140],
  5: [130, 200],
};

/** Approximate 2026 Central Bank of Armenia reference rates (AMD per unit). Synthetic series is generated around these. */
export const EXCHANGE_RATE_BASE: Readonly<Record<'USD' | 'EUR', number>> = {
  USD: 385.5,
  EUR: 447.0,
};

/** Gross annual rental yield used to derive synthetic rent snapshots from sale prices. */
export const GROSS_RENTAL_YIELD = 0.065;

/** Months of district market history to generate. */
export const SNAPSHOT_MONTHS = 12;

/** Monthly price drift applied backwards from the reference month. */
export const MONTHLY_PRICE_DRIFT = 0.005;
