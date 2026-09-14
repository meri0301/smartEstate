/**
 * CLI wrapper around `runSeed`, invoked by `prisma db seed` (see prisma.config.ts).
 *
 *   pnpm db:seed          rebuild the synthetic market data
 *   pnpm db:reset         drop, migrate and seed
 */
import path from 'node:path';
import { runSeed } from './seed/run.js';

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

await runSeed(resolveDatabaseUrl());
