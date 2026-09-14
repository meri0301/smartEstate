/**
 * Programmatic seed entry point, shared by the `prisma db seed` CLI wrapper and
 * the integration-test bootstrap. Deterministic: same RNG seed and reference
 * date on every run (see prisma/seed/data/calibration.ts).
 *
 * Destructive for market data: districts, POIs, buildings, listings and
 * everything referencing them are truncated and rebuilt. User accounts and
 * their preferences are left untouched.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { SEED_LISTING_TOTAL, SEED_REFERENCE_DATE, SEED_RNG_SEED } from './data/calibration.js';
import type { SeedContext } from './lib/context.js';
import { createRng } from './lib/random.js';
import { seedDistricts } from './steps/districts.js';
import { seedExchangeRates } from './steps/exchange-rates.js';
import { seedInventory } from './steps/inventory.js';
import { seedPointsOfInterest } from './steps/pois.js';
import { seedMarketSnapshots } from './steps/snapshots.js';
import { seedStreetAliases } from './steps/street-aliases.js';

export interface SeedSummary {
  districts: number;
  pointsOfInterest: number;
  exchangeRates: number;
  buildings: number;
  listings: number;
  translations: number;
  media: number;
  priceHistory: number;
  marketSnapshots: number;
  streetAliases: number;
  durationMs: number;
}

export interface SeedOptions {
  /** Suppress progress output (used by tests). */
  quiet?: boolean;
}

async function truncateMarketData(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      listings, buildings, districts, points_of_interest,
      exchange_rates, district_market_snapshots, street_aliases
    RESTART IDENTITY CASCADE`;
}

export async function runSeed(
  databaseUrl: string,
  options: SeedOptions = {},
): Promise<SeedSummary> {
  const log = (message: string): void => {
    if (options.quiet !== true) {
      console.info(message);
    }
  };
  const startedAt = Date.now();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const ctx: SeedContext = {
    prisma,
    rng: createRng(SEED_RNG_SEED),
    referenceDate: SEED_REFERENCE_DATE,
  };

  try {
    log(
      `seed: rng seed ${String(SEED_RNG_SEED)}, reference date ${SEED_REFERENCE_DATE.toISOString()}`,
    );
    await truncateMarketData(prisma);

    const districts = await seedDistricts(ctx);
    log(`seed: ${String(districts.length)} districts`);

    const pointsOfInterest = await seedPointsOfInterest(ctx);
    log(`seed: ${String(pointsOfInterest)} points of interest`);

    const rates = await seedExchangeRates(ctx);
    log(`seed: ${String(rates.count)} exchange rates (USD→AMD ${rates.usdToAmd.toFixed(2)})`);

    const inventory = await seedInventory(ctx, districts, rates.usdToAmd);
    log(
      `seed: ${String(inventory.buildings)} buildings, ${String(inventory.listings)} listings, ` +
        `${String(inventory.translations)} translations, ${String(inventory.media)} media, ` +
        `${String(inventory.priceHistory)} price history rows`,
    );
    if (inventory.listings !== SEED_LISTING_TOTAL) {
      throw new Error(
        `Expected ${String(SEED_LISTING_TOTAL)} listings, inserted ${String(inventory.listings)}`,
      );
    }

    const marketSnapshots = await seedMarketSnapshots(ctx, districts);
    log(`seed: ${String(marketSnapshots)} district market snapshots`);

    const streetAliases = await seedStreetAliases(ctx);
    log(`seed: ${String(streetAliases)} street aliases`);

    const durationMs = Date.now() - startedAt;
    log(`seed: done in ${String(durationMs)} ms`);
    return {
      districts: districts.length,
      pointsOfInterest,
      exchangeRates: rates.count,
      ...inventory,
      marketSnapshots,
      streetAliases,
      durationMs,
    };
  } finally {
    await prisma.$disconnect();
  }
}
