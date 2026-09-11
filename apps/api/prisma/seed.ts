/**
 * Database seed — deterministic synthetic Yerevan market.
 *
 *   pnpm db:seed          (via `prisma db seed`, configured in prisma.config.ts)
 *   pnpm db:reset         (drops, migrates and seeds)
 *
 * The seed is destructive for market data: districts, POIs, buildings,
 * listings and everything that references them are truncated and rebuilt.
 * User accounts and their preferences are left untouched.
 */
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { SEED_LISTING_TOTAL, SEED_REFERENCE_DATE, SEED_RNG_SEED } from './seed/data/calibration.js';
import type { SeedContext } from './seed/lib/context.js';
import { createRng } from './seed/lib/random.js';
import { seedDistricts } from './seed/steps/districts.js';
import { seedExchangeRates } from './seed/steps/exchange-rates.js';
import { seedInventory } from './seed/steps/inventory.js';
import { seedPointsOfInterest } from './seed/steps/pois.js';
import { seedMarketSnapshots } from './seed/steps/snapshots.js';
import { seedStreetAliases } from './seed/steps/street-aliases.js';

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
    try {
      process.loadEnvFile(path.resolve(import.meta.dirname, '../../../.env'));
    } catch {
      // No root .env; fall through to the explicit error below.
    }
  }
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not set');
  }
  return url;
}

async function truncateMarketData(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      listings, buildings, districts, points_of_interest,
      exchange_rates, district_market_snapshots, street_aliases
    RESTART IDENTITY CASCADE`;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
  const prisma = new PrismaClient({ adapter });
  const ctx: SeedContext = {
    prisma,
    rng: createRng(SEED_RNG_SEED),
    referenceDate: SEED_REFERENCE_DATE,
  };

  try {
    console.info(
      `seed: rng seed ${String(SEED_RNG_SEED)}, reference date ${SEED_REFERENCE_DATE.toISOString()}`,
    );
    await truncateMarketData(prisma);

    const districts = await seedDistricts(ctx);
    console.info(`seed: ${String(districts.length)} districts`);

    const pois = await seedPointsOfInterest(ctx);
    console.info(`seed: ${String(pois)} points of interest`);

    const rates = await seedExchangeRates(ctx);
    console.info(
      `seed: ${String(rates.count)} exchange rates (USD→AMD ${rates.usdToAmd.toFixed(2)})`,
    );

    const inventory = await seedInventory(ctx, districts, rates.usdToAmd);
    console.info(
      `seed: ${String(inventory.buildings)} buildings, ${String(inventory.listings)} listings, ` +
        `${String(inventory.translations)} translations, ${String(inventory.media)} media, ` +
        `${String(inventory.priceHistory)} price history rows`,
    );
    if (inventory.listings !== SEED_LISTING_TOTAL) {
      throw new Error(
        `Expected ${String(SEED_LISTING_TOTAL)} listings, inserted ${String(inventory.listings)}`,
      );
    }

    const snapshots = await seedMarketSnapshots(ctx, districts);
    console.info(`seed: ${String(snapshots)} district market snapshots`);

    const aliases = await seedStreetAliases(ctx);
    console.info(`seed: ${String(aliases)} street aliases`);

    console.info(`seed: done in ${String(Date.now() - startedAt)} ms`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
