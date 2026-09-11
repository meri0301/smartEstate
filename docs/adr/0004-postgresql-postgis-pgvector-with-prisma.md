# 0004 — PostgreSQL with PostGIS and pgvector, accessed through Prisma

**Status:** Accepted
**Date:** 2026-09-11

## Context

SmartEstate needs three kinds of queries against one dataset of a few thousand listings:
relational filtering and sorting (price, rooms, district, status), geospatial computation
(point-in-polygon for districts, distance to the nearest metro station or school, later
isochrone containment), and approximate nearest-neighbour search over multilingual text
embeddings for hybrid semantic search. A thesis project run by one developer cannot afford to
operate, synchronise and explain three separate data stores.

The ORM must give type-safe access from TypeScript, readable migrations the examiner can
audit, and it must not fight the geospatial and vector features it does not understand.

## Decision

1. **One PostgreSQL 16 database** with the **PostGIS** and **pgvector** extensions. PostGIS
   provides `geometry(Point, 4326)` and `geometry(MultiPolygon, 4326)` columns with GiST
   indexes and functions such as `ST_Contains` and `ST_Distance`. pgvector provides a
   `vector(768)` column with an HNSW index and cosine distance. Hybrid search (Phase 8) is a
   single SQL statement combining both with structured filters, which is only possible
   because they share an engine. Alternatives rejected: a dedicated vector database
   (operational cost, no joins with structured filters, weaker reproducibility) and
   application-side geometry (no spatial index, wrong for isochrones).

2. **Prisma 7** as the ORM, with the driver-adapter client over `pg`. The schema file doubles
   as data-model documentation, migrations are plain SQL under version control, and the
   generated client is fully typed. Features Prisma cannot express are handled explicitly:
   - Geometry and vector columns are declared as `Unsupported(...)`; they exist in the
     database and in migrations but are read and written with `$queryRaw` / `$executeRaw`.
   - GiST indexes are declared in the schema (`@@index([...], type: Gist)`).
   - The HNSW index cannot be declared, so `listing_embeddings` is registered as an
     **external table** in `prisma.config.ts`; its DDL lives in hand-written migration SQL,
     Prisma Client is still generated for it, and Prisma Migrate ignores it when diffing.
     PostGIS's own `spatial_ref_sys` table is declared external for the same reason.
   - Required extensions are created inside the first migration so that the shadow
     database and any fresh database receive them; the Docker init script is a convenience,
     not the source of truth.

3. **Schema conventions**, chosen for readability of raw SQL and reproducibility:
   snake_case table and column names via `@@map`/`@map`; time-ordered **UUIDv7** primary
   keys; canonical **AMD amounts as BigInt** with the original currency and price retained;
   `Decimal` for areas and rates; `timestamptz(3)` for all timestamps.

4. **Synthetic seed data only.** The seed generates 300 Yerevan listings from an explicit,
   documented price model (district median × building type × condition × floor × ceiling ×
   log-normal noise) inside real OpenStreetMap district boundaries. No listing portal is
   scraped. Boundaries and points of interest are downloaded once by a script, committed as
   GeoJSON with ODbL attribution, and the seed itself runs offline and deterministically
   (fixed RNG seed and reference date).

## Consequences

- Every geospatial or vector query is raw SQL by design. Those queries are isolated in
  repository classes so the rest of the codebase stays on the typed client.
- Changes to `listing_embeddings` (for example a new embedding dimension) require a
  hand-written migration; the schema comment says so.
- The seed's price structure is known, so the valuation model (Phase 7) can be evaluated
  against ground truth: recovered coefficients for building type and condition should
  approximate the seeded multipliers. This is a feature for the thesis, and a limitation to
  state clearly: results on synthetic data do not transfer directly to the real market.
- The ERD in `docs/diagrams/erd.md` is generated from the schema and checked in CI, so the
  thesis figure cannot drift from the implementation.
