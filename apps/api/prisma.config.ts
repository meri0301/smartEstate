import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI configuration (Prisma 7 moved the datasource URL out of the schema).
 * The repository keeps a single `.env` at the monorepo root; load it if present.
 * In CI and containers the variable is injected directly and no file exists.
 *
 * `env('DATABASE_URL')` fails fast with a clear message when the variable is
 * missing. Commands that never connect (`prisma generate`, `prisma validate`)
 * still need a syntactically valid value; CI jobs without a database set the
 * one from `.env.example`.
 */
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env'));
} catch {
  // No .env at the repo root — rely on the process environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
  // Tables Prisma Migrate must not manage:
  // - `spatial_ref_sys` is created by the PostGIS extension, not by us.
  // - `listing_embeddings` carries an HNSW index (pgvector) that Prisma Schema
  //   Language cannot express; its DDL lives in hand-written migration SQL.
  //   Prisma Client is still generated for the model; only diffing ignores it.
  experimental: {
    externalTables: true,
  },
  tables: {
    external: ['public.spatial_ref_sys', 'public.listing_embeddings'],
  },
});
