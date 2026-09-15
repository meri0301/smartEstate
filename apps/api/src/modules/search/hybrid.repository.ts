/**
 * The two arms of hybrid search, as SQL.
 *
 * Each returns an ordered list of listing ids and nothing else. Scores stay
 * here: the fusion works on ranks, so handing a `ts_rank` or a cosine distance
 * up the stack would only invite somebody to compare two numbers that have no
 * common scale. What leaves this file is an order.
 *
 * Both arms apply the same filters, built by the same function the ordinary
 * listing search uses. That is deliberate and worth more than it looks: a
 * "under 60 million" that meant one thing in the filter panel and another in the
 * search box would be a bug nobody could see, and duplicating the predicates is
 * the way that bug gets written.
 */
import { Injectable } from '@nestjs/common';
import type { ListingSearchQuery } from '@smartestate/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { toVectorLiteral } from '../embeddings/embeddings.repository.js';
import type { ListingRow } from '../listings/listing-row.js';
import { buildFilters, LISTING_SELECT } from '../listings/search-query.builder.js';
import { toLexicalQuery } from './lexical-query.js';

/**
 * How deep each arm looks before fusion.
 *
 * Fusion can only reorder what it is given, so this is the real recall ceiling
 * of the feature. Fifty per arm is far more than a page and cheap on a catalogue
 * of this size; it is a constant rather than a parameter because the thesis
 * reports results at one depth and varying it per request would make two runs
 * incomparable.
 */
export const ARM_DEPTH = 50;

/** The joins every filter predicate expects to find. `b` and `d` are referenced by name. */
const LISTING_JOINS = Prisma.sql`
  FROM listings l
  JOIN buildings b ON b.id = l.building_id
  JOIN districts d ON d.id = l.district_id`;

/**
 * Text search configuration per locale, matching the generated column.
 *
 * It has to match: a vector built with the Russian stemmer and a query built
 * with `simple` would agree on almost nothing. Armenian has no stemmer in
 * PostgreSQL, so both sides use `simple` and Armenian matches word forms.
 */
const LOCALE_CONFIG = Prisma.sql`
  CASE t.locale
    WHEN 'ru' THEN 'russian'::regconfig
    WHEN 'en' THEN 'english'::regconfig
    ELSE 'simple'::regconfig
  END`;

@Injectable()
export class HybridSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listings whose text matches the words, best first.
   *
   * The sentence is rewritten into a disjunction first — see `toLexicalQuery`
   * for why an AND query is the wrong question here — and `ts_rank` decides
   * which of the matches were the better ones.
   *
   * A listing has up to three translations and could match in several. Grouping
   * by listing and keeping the best rank means a listing appears once, ranked by
   * its strongest match, rather than three times in a row.
   */
  async lexical(query: string, filters: ListingSearchQuery): Promise<string[]> {
    const websearch = toLexicalQuery(query);
    if (websearch === undefined) {
      return [];
    }
    const where = buildFilters(filters);
    const rows = await this.prisma.$queryRaw<{ listing_id: string }[]>`
      SELECT l.id AS listing_id, max(ts_rank(t.search_vector, tsq.query)) AS rank
      ${LISTING_JOINS}
      JOIN listing_translations t ON t.listing_id = l.id
      CROSS JOIN LATERAL (SELECT websearch_to_tsquery(${LOCALE_CONFIG}, ${websearch}) AS query) tsq
      WHERE ${Prisma.join(where, ' AND ')}
        AND t.search_vector @@ tsq.query
      GROUP BY l.id
      ORDER BY rank DESC, l.id
      LIMIT ${ARM_DEPTH}`;
    return rows.map((row) => row.listing_id);
  }

  /**
   * Listings whose meaning is closest to the query vector, nearest first.
   *
   * `<=>` is cosine distance, which is what the HNSW index was built for; any
   * other operator here would silently stop using the index and start scanning.
   * The vector is bound as a parameter rather than interpolated — a literal of
   * 384 numbers assembled by string concatenation is how an injection gets
   * written by accident.
   */
  async semantic(embedding: readonly number[], filters: ListingSearchQuery): Promise<string[]> {
    const where = buildFilters(filters);
    const vector = toVectorLiteral(embedding);
    const rows = await this.prisma.$queryRaw<{ listing_id: string }[]>`
      SELECT l.id AS listing_id, e.embedding <=> ${vector}::vector AS distance
      ${LISTING_JOINS}
      JOIN listing_embeddings e ON e.listing_id = l.id
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY distance ASC, l.id
      LIMIT ${ARM_DEPTH}`;
    return rows.map((row) => row.listing_id);
  }

  /**
   * The full rows for a set of ids, in whatever order the database returns them.
   *
   * The arms deal in ids alone, so the listings themselves are read once, at the
   * end, for the handful that survived fusion — rather than selecting forty
   * columns twice for a hundred candidates that will not be shown.
   */
  rowsByIds(listingIds: readonly string[]): Promise<ListingRow[]> {
    return this.prisma.$queryRaw<ListingRow[]>`${LISTING_SELECT}
      WHERE l.id IN (${Prisma.join(listingIds.map((id) => Prisma.sql`${id}::uuid`))})`;
  }

  /** Whether there is anything to search semantically at all. */
  async hasVectors(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ present: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM listing_embeddings) AS present`;
    return rows[0]?.present ?? false;
  }
}
