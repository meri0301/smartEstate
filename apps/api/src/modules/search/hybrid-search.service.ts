/**
 * Searching by sentence: the whole pipeline, in one place.
 *
 * A sentence carries two kinds of information and this is where they are
 * separated. The exact part — three rooms, under 60 million, in Arabkir — became
 * filters in the parser, and filters are applied as constraints that are right
 * every time. The inexact part — quiet, bright, near a school, good for a family
 * — is what the parser reports as unmapped, and it is what the two ranking arms
 * are for.
 *
 * Both arms search inside the filters, never around them. A listing over budget
 * is not a worse answer to "under 60 million", it is not an answer, and no
 * amount of semantic similarity should be able to argue otherwise.
 *
 * The semantic arm is optional by design. Without a model service, without an
 * encoder, or before the first backfill, the search runs lexically and says so.
 * That is the same fallback rule as everywhere else in this product, and it is
 * why nothing here throws when the model is missing.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  type HybridSearchBody,
  type HybridSearchResponse,
  type HybridSearchResult,
  type ListingSearchQuery,
  type Locale,
  type ParsedFilters,
  type SearchArm,
  type SemanticSkipReason,
} from '@smartestate/contracts';
import { MlClient, MlUnavailableError } from '../../infrastructure/ml/ml.client.js';
import { toListingSummary } from '../listings/listing.mapper.js';
import { ListingsRepository } from '../listings/listings.repository.js';
import { HybridSearchRepository } from './hybrid.repository.js';
import { QueryParserService } from './query-parser.service.js';
import { fuse, RRF_K, type RankedArm } from './rrf.js';

@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  constructor(
    private readonly parser: QueryParserService,
    private readonly hybrid: HybridSearchRepository,
    private readonly listings: ListingsRepository,
    private readonly ml: MlClient,
  ) {}

  async search(body: HybridSearchBody, locale: Locale): Promise<HybridSearchResponse> {
    // Parsed even when the caller supplies filters: the unmapped phrases belong
    // to the sentence, not to the filters, and they are what the reader is told
    // the semantic arm is answering.
    const parsed = await this.parser.parse(body.query, locale);
    const filters = body.filters ?? parsed.filters;
    const searchQuery = toSearchQuery(filters);

    const lexical = await this.hybrid.lexical(body.query, searchQuery);
    const arms: RankedArm[] = [{ name: 'lexical', listingIds: lexical }];

    const semantic = await this.semanticArm(body.query, searchQuery);
    if (semantic.listingIds !== undefined) {
      arms.push({ name: 'semantic', listingIds: semantic.listingIds });
    }

    const fused = fuse(arms, RRF_K).slice(0, body.limit);
    const results = await this.hydrate(fused, locale);

    return {
      query: body.query,
      filters,
      unmapped: parsed.unmapped,
      parseSource: parsed.source,
      arms: arms.map((arm) => arm.name as SearchArm),
      ...(semantic.skipped === undefined ? {} : { semanticSkipped: semantic.skipped }),
      rrfK: RRF_K,
      results,
    };
  }

  /**
   * The semantic ranking, or the reason there isn't one.
   *
   * The index is checked before the encoder is asked: embedding a query costs a
   * model call, and there is nothing to compare it against until a backfill has
   * run. Getting that order wrong would spend the encoder on every search of an
   * empty index.
   */
  private async semanticArm(
    query: string,
    filters: ListingSearchQuery,
  ): Promise<{ listingIds?: string[]; skipped?: SemanticSkipReason }> {
    if (!(await this.hybrid.hasVectors())) {
      return { skipped: 'not-indexed' };
    }
    try {
      const answer = await this.ml.embed([query], 'query');
      const embedding = answer.embeddings[0];
      if (embedding === undefined) {
        return { skipped: 'unavailable' };
      }
      return { listingIds: await this.hybrid.semantic(embedding, filters) };
    } catch (error) {
      if (!(error instanceof MlUnavailableError)) {
        throw error;
      }
      this.logger.warn({ err: error }, 'searching lexically; the encoder is unavailable');
      return { skipped: 'unavailable' };
    }
  }

  /**
   * Turns fused ids into the summaries the client renders.
   *
   * The database returns rows in whatever order it likes, so they are put back
   * into fusion order here. Reading them back in query order instead would
   * silently discard the ranking this whole service exists to produce.
   */
  private async hydrate(
    fused: readonly { listingId: string; score: number; ranks: HybridSearchResult['ranks'] }[],
    locale: Locale,
  ): Promise<HybridSearchResult[]> {
    const ids = fused.map((entry) => entry.listingId);
    if (ids.length === 0) {
      return [];
    }
    const [rows, translations, thumbnails] = await Promise.all([
      this.hybrid.rowsByIds(ids),
      this.listings.findTranslations(ids),
      this.listings.findThumbnails(ids),
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));

    return fused.flatMap((entry, index) => {
      const row = byId.get(entry.listingId);
      if (row === undefined) {
        return [];
      }
      return [
        {
          listing: toListingSummary(
            row,
            translations.filter((translation) => translation.listingId === row.id),
            thumbnails.find((media) => media.listingId === row.id),
            locale,
          ),
          rank: index + 1,
          score: Math.round(entry.score * 1e6) / 1e6,
          ranks: entry.ranks,
        },
      ];
    });
  }
}

/**
 * The parsed filters as the listing search understands them.
 *
 * `PUBLISHED` is forced rather than passed through: this endpoint is public, and
 * a draft is not something a sentence should be able to reach. Sort and
 * pagination are absent because fusion decides the order and there are no pages.
 */
export function toSearchQuery(filters: ParsedFilters): ListingSearchQuery {
  return {
    ...filters,
    status: 'PUBLISHED',
    sort: 'published_desc',
    // The arms set their own depth; nothing here reads these two, and they exist
    // because the shared filter builder takes the whole query object.
    limit: 0,
    mine: false,
  };
}
