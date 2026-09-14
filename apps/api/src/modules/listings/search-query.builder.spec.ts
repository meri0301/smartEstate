import { listingSearchQuerySchema } from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import { encodeCursor } from '../../common/pagination/cursor.js';
import {
  buildFilters,
  buildKeysetPredicate,
  buildOrderBy,
  buildSearchStatement,
  cursorOf,
} from './search-query.builder.js';
import type { ListingRow } from './listing-row.js';

const id = '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f';
const parse = (input: Record<string, unknown>) => listingSearchQuerySchema.parse(input);

/** Renders a Prisma.Sql fragment with `$n` placeholders for assertions. */
const sqlOf = (fragment: { sql: string; values: unknown[] }) => ({
  text: fragment.sql.replaceAll(/\s+/g, ' ').trim(),
  values: fragment.values,
});

describe('buildFilters', () => {
  it('always constrains status and nothing else for an empty query', () => {
    const filters = buildFilters(parse({}));
    expect(filters).toHaveLength(1);
    expect(sqlOf(filters[0] ?? { sql: '', values: [] })).toEqual({
      text: 'l.status = ?::"ListingStatus"',
      values: ['PUBLISHED'],
    });
  });

  it('adds an ownership predicate when the search is scoped to one owner', () => {
    const ownerId = '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e01';
    const filters = buildFilters(parse({}), { ownerId });
    expect(filters).toHaveLength(2);
    expect(sqlOf(filters[1] ?? { sql: '', values: [] })).toEqual({
      text: 'l.created_by_id = ?::uuid',
      values: [ownerId],
    });
  });

  it('binds every numeric range as a parameter', () => {
    const filters = buildFilters(
      parse({
        priceMin: '30000000',
        priceMax: '60000000',
        roomsMin: '2',
        areaMax: '90.5',
        yearMin: '1990',
      }),
    );
    const rendered = filters.map(sqlOf);
    expect(rendered).toContainEqual({ text: 'l.price_amd >= ?', values: [30_000_000] });
    expect(rendered).toContainEqual({ text: 'l.price_amd <= ?', values: [60_000_000] });
    expect(rendered).toContainEqual({ text: 'l.rooms >= ?', values: [2] });
    expect(rendered).toContainEqual({ text: 'l.total_area <= ?', values: [90.5] });
    expect(rendered).toContainEqual({ text: 'b.construction_year >= ?', values: [1990] });
  });

  it('expands list filters into IN clauses with one placeholder per value', () => {
    const [, districts, types] = buildFilters(
      parse({ districts: 'kentron,arabkir', buildingTypes: 'STONE' }),
    ).map(sqlOf);
    expect(districts).toEqual({ text: 'd.slug IN (?,?)', values: ['kentron', 'arabkir'] });
    expect(types).toEqual({ text: 'b.building_type::text IN (?)', values: ['STONE'] });
  });

  it('maps boolean flags to the intended predicates', () => {
    const rendered = buildFilters(
      parse({
        excludeGroundFloor: 'true',
        excludeTopFloor: 'true',
        hasBalcony: 'false',
        docsVerified: 'true',
        hasElevator: 'false',
      }),
    ).map((f) => sqlOf(f).text);
    expect(rendered).toContain('l.floor > 1');
    expect(rendered).toContain('l.floor < b.total_floors');
    expect(rendered).toContain('l.balcony_count = 0');
    expect(rendered).toContain(`l.ownership_docs = 'VERIFIED'::"OwnershipDocsStatus"`);
    expect(rendered).toContain('b.has_elevator = ?');
  });

  it('adds geography predicates for radius and bounding-box searches', () => {
    const near = buildFilters(parse({ nearLat: '40.18', nearLon: '44.51', radiusM: '1500' }))
      .map(sqlOf)
      .at(-1);
    expect(near?.text).toContain('ST_DWithin');
    expect(near?.values).toEqual([44.51, 40.18, 1500]);

    const bbox = buildFilters(parse({ bbox: '44.4,40.1,44.6,40.25' }))
      .map(sqlOf)
      .at(-1);
    expect(bbox?.text).toContain('ST_MakeEnvelope');
    expect(bbox?.values).toEqual([44.4, 40.1, 44.6, 40.25]);
  });
});

describe('ordering and keyset pagination', () => {
  it('orders by the sort column with the id as tie-breaker in the same direction', () => {
    expect(sqlOf(buildOrderBy('price_asc')).text).toBe('ORDER BY l.price_amd ASC, l.id ASC');
    expect(sqlOf(buildOrderBy('published_desc')).text).toBe(
      'ORDER BY l.published_at DESC, l.id DESC',
    );
  });

  it('uses row-value comparison with the operator matching the direction', () => {
    expect(sqlOf(buildKeysetPredicate('price_asc', { v: 45_000_000, id }))).toEqual({
      text: '(l.price_amd, l.id) > (?::bigint, ?::uuid)',
      values: ['45000000', id],
    });
    expect(
      sqlOf(buildKeysetPredicate('published_desc', { v: '2026-09-01T00:00:00.000Z', id })),
    ).toEqual({
      text: '(l.published_at, l.id) < (?::timestamptz, ?::uuid)',
      values: ['2026-09-01T00:00:00.000Z', id],
    });
    expect(sqlOf(buildKeysetPredicate('area_desc', { v: 72.5, id })).text).toBe(
      '(l.total_area, l.id) < (?::numeric, ?::uuid)',
    );
  });

  it('extracts the cursor value that matches the sort', () => {
    const row = {
      id,
      price_amd: 45_000_000n,
      price_per_sqm_amd: 625_000,
      total_area: { toString: () => '72.00' },
      published_at: new Date('2026-09-01T00:00:00.000Z'),
    } as unknown as ListingRow;
    expect(cursorOf('price_desc')(row)).toEqual({ v: 45_000_000, id });
    expect(cursorOf('price_per_sqm_asc')(row)).toEqual({ v: 625_000, id });
    expect(cursorOf('area_asc')(row)).toEqual({ v: 72, id });
    expect(cursorOf('published_desc')(row)).toEqual({ v: '2026-09-01T00:00:00.000Z', id });
  });

  it('assembles a full statement with the extra row and the cursor predicate', () => {
    const cursor = encodeCursor({ v: 45_000_000, id });
    const statement = sqlOf(
      buildSearchStatement(parse({ sort: 'price_asc', limit: '10', cursor, roomsMin: '2' })),
    );
    expect(statement.text).toContain('FROM listings l JOIN buildings b');
    expect(statement.text).toContain(
      'WHERE l.status = ?::"ListingStatus" AND l.rooms >= ? AND (l.price_amd, l.id) > (?::bigint, ?::uuid)',
    );
    expect(statement.text).toContain('ORDER BY l.price_amd ASC, l.id ASC LIMIT ?');
    expect(statement.values.at(-1)).toBe(11);
  });
});
