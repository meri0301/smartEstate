/**
 * Translates a validated `ListingSearchQuery` into SQL fragments. Kept free of
 * I/O so the exact predicates and ordering are unit-testable without a database.
 * All values are bound parameters; only column names and operators are literal.
 */
import type { ListingSearchQuery, ListingSort } from '@smartestate/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { decodeCursor, type CursorPayload } from '../../common/pagination/cursor.js';
import type { ListingRow } from './listing-row.js';
import { toNumber } from './listing-row.js';

export interface SortSpec {
  /** Column expression the ordering is based on. */
  column: Prisma.Sql;
  direction: 'ASC' | 'DESC';
  /** SQL type the cursor value must be cast to for the row comparison. */
  castType: 'timestamptz' | 'bigint' | 'integer' | 'numeric';
  /** Extracts the cursor value of a row. */
  cursorValue: (row: ListingRow) => number | string;
}

export const SORT_SPECS: Readonly<Record<ListingSort, SortSpec>> = {
  published_desc: {
    column: Prisma.sql`l.published_at`,
    direction: 'DESC',
    castType: 'timestamptz',
    cursorValue: (row) => row.published_at.toISOString(),
  },
  price_asc: {
    column: Prisma.sql`l.price_amd`,
    direction: 'ASC',
    castType: 'bigint',
    cursorValue: (r) => toNumber(r.price_amd),
  },
  price_desc: {
    column: Prisma.sql`l.price_amd`,
    direction: 'DESC',
    castType: 'bigint',
    cursorValue: (r) => toNumber(r.price_amd),
  },
  price_per_sqm_asc: {
    column: Prisma.sql`l.price_per_sqm_amd`,
    direction: 'ASC',
    castType: 'integer',
    cursorValue: (r) => r.price_per_sqm_amd,
  },
  price_per_sqm_desc: {
    column: Prisma.sql`l.price_per_sqm_amd`,
    direction: 'DESC',
    castType: 'integer',
    cursorValue: (r) => r.price_per_sqm_amd,
  },
  area_asc: {
    column: Prisma.sql`l.total_area`,
    direction: 'ASC',
    castType: 'numeric',
    cursorValue: (r) => toNumber(r.total_area),
  },
  area_desc: {
    column: Prisma.sql`l.total_area`,
    direction: 'DESC',
    castType: 'numeric',
    cursorValue: (r) => toNumber(r.total_area),
  },
};

/** Columns shared by search and detail queries. */
export const LISTING_SELECT = Prisma.sql`
  SELECT l.id, l.public_id, l.status, l.price_amd, l.price_per_sqm_amd, l.original_currency, l.original_price,
         l.price_negotiable, l.rooms, l.bathrooms, l.total_area, l.living_area, l.kitchen_area, l.ceiling_height,
         l.floor, l.balcony_count, l.has_loggia, l.has_parking, l.has_storage, l.condition, l.heating,
         l.ownership_docs, ST_X(l.location) AS lon, ST_Y(l.location) AS lat,
         l.published_at, l.created_at, l.updated_at, l.created_by_id, l.building_id, l.district_id,
         b.address_line AS b_address_line, b.street_hy AS b_street_hy, b.street_ru AS b_street_ru,
         b.street_en AS b_street_en, b.house_number AS b_house_number, b.building_type AS b_building_type,
         b.construction_year AS b_construction_year, b.total_floors AS b_total_floors,
         b.has_elevator AS b_has_elevator, b.seismic_retrofit AS b_seismic_retrofit,
         ST_X(b.location) AS b_lon, ST_Y(b.location) AS b_lat,
         d.slug AS d_slug, d.name_hy AS d_name_hy, d.name_ru AS d_name_ru, d.name_en AS d_name_en
  FROM listings l
  JOIN buildings b ON b.id = l.building_id
  JOIN districts d ON d.id = l.district_id`;

/** WHERE predicates for every filter present in the query (status always included). */
export function buildFilters(query: ListingSearchQuery): Prisma.Sql[] {
  const where: Prisma.Sql[] = [Prisma.sql`l.status = ${query.status}::"ListingStatus"`];
  const range = (column: Prisma.Sql, min: number | undefined, max: number | undefined): void => {
    if (min !== undefined) {
      where.push(Prisma.sql`${column} >= ${min}`);
    }
    if (max !== undefined) {
      where.push(Prisma.sql`${column} <= ${max}`);
    }
  };

  range(Prisma.sql`l.price_amd`, query.priceMin, query.priceMax);
  range(Prisma.sql`l.price_per_sqm_amd`, undefined, query.pricePerSqmMax);
  range(Prisma.sql`l.rooms`, query.roomsMin, query.roomsMax);
  range(Prisma.sql`l.total_area`, query.areaMin, query.areaMax);
  range(Prisma.sql`l.floor`, query.floorMin, query.floorMax);
  range(Prisma.sql`l.ceiling_height`, query.ceilingMin, undefined);
  range(Prisma.sql`b.construction_year`, query.yearMin, query.yearMax);

  if (query.districts !== undefined) {
    where.push(Prisma.sql`d.slug IN (${Prisma.join(query.districts)})`);
  }
  if (query.buildingTypes !== undefined) {
    where.push(Prisma.sql`b.building_type::text IN (${Prisma.join(query.buildingTypes)})`);
  }
  if (query.conditions !== undefined) {
    where.push(Prisma.sql`l.condition::text IN (${Prisma.join(query.conditions)})`);
  }
  if (query.heating !== undefined) {
    where.push(Prisma.sql`l.heating::text IN (${Prisma.join(query.heating)})`);
  }

  if (query.excludeGroundFloor === true) {
    where.push(Prisma.sql`l.floor > 1`);
  }
  if (query.excludeTopFloor === true) {
    where.push(Prisma.sql`l.floor < b.total_floors`);
  }
  if (query.hasElevator !== undefined) {
    where.push(Prisma.sql`b.has_elevator = ${query.hasElevator}`);
  }
  if (query.hasParking !== undefined) {
    where.push(Prisma.sql`l.has_parking = ${query.hasParking}`);
  }
  if (query.hasStorage !== undefined) {
    where.push(Prisma.sql`l.has_storage = ${query.hasStorage}`);
  }
  if (query.hasBalcony !== undefined) {
    where.push(
      query.hasBalcony ? Prisma.sql`l.balcony_count > 0` : Prisma.sql`l.balcony_count = 0`,
    );
  }
  if (query.seismicRetrofit !== undefined) {
    where.push(Prisma.sql`b.seismic_retrofit = ${query.seismicRetrofit}`);
  }
  if (query.docsVerified !== undefined) {
    where.push(
      query.docsVerified
        ? Prisma.sql`l.ownership_docs = 'VERIFIED'::"OwnershipDocsStatus"`
        : Prisma.sql`l.ownership_docs = 'UNVERIFIED'::"OwnershipDocsStatus"`,
    );
  }
  if (query.priceNegotiable !== undefined) {
    where.push(Prisma.sql`l.price_negotiable = ${query.priceNegotiable}`);
  }

  if (query.nearLat !== undefined && query.nearLon !== undefined && query.radiusM !== undefined) {
    where.push(Prisma.sql`ST_DWithin(
      l.location::geography,
      ST_SetSRID(ST_MakePoint(${query.nearLon}::double precision, ${query.nearLat}::double precision), 4326)::geography,
      ${query.radiusM}::double precision
    )`);
  }
  if (query.bbox !== undefined) {
    const { minLon, minLat, maxLon, maxLat } = query.bbox;
    where.push(Prisma.sql`l.location && ST_MakeEnvelope(
      ${minLon}::double precision, ${minLat}::double precision,
      ${maxLon}::double precision, ${maxLat}::double precision, 4326
    )`);
  }
  return where;
}

/**
 * Keyset predicate: rows strictly after the cursor row in the sort order.
 * Row-value comparison `(sort_col, id) < (v, id)` uses the composite ordering
 * Postgres applies for `ORDER BY sort_col, id`, so no rows are skipped or repeated.
 */
export function buildKeysetPredicate(sort: ListingSort, cursor: CursorPayload): Prisma.Sql {
  const spec = SORT_SPECS[sort];
  const operator = spec.direction === 'DESC' ? Prisma.sql`<` : Prisma.sql`>`;
  const castValue = castCursorValue(spec.castType, cursor.v);
  return Prisma.sql`(${spec.column}, l.id) ${operator} (${castValue}, ${cursor.id}::uuid)`;
}

function castCursorValue(castType: SortSpec['castType'], value: number | string): Prisma.Sql {
  switch (castType) {
    case 'timestamptz':
      return Prisma.sql`${String(value)}::timestamptz`;
    case 'bigint':
      return Prisma.sql`${String(value)}::bigint`;
    case 'integer':
      return Prisma.sql`${Number(value)}::integer`;
    case 'numeric':
      return Prisma.sql`${String(value)}::numeric`;
  }
}

export function buildOrderBy(sort: ListingSort): Prisma.Sql {
  const spec = SORT_SPECS[sort];
  const direction = spec.direction === 'DESC' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  return Prisma.sql`ORDER BY ${spec.column} ${direction}, l.id ${direction}`;
}

/** Complete search statement fetching `limit + 1` rows for continuation detection. */
export function buildSearchStatement(query: ListingSearchQuery): Prisma.Sql {
  const where = buildFilters(query);
  if (query.cursor !== undefined) {
    where.push(buildKeysetPredicate(query.sort, decodeCursor(query.cursor)));
  }
  return Prisma.sql`${LISTING_SELECT}
    WHERE ${Prisma.join(where, ' AND ')}
    ${buildOrderBy(query.sort)}
    LIMIT ${query.limit + 1}`;
}

export function cursorOf(sort: ListingSort): (row: ListingRow) => CursorPayload {
  const spec = SORT_SPECS[sort];
  return (row) => ({ v: spec.cursorValue(row), id: row.id });
}
