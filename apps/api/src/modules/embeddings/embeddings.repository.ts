/**
 * Reading and writing the vector column.
 *
 * Prisma cannot express `vector` — it is an `Unsupported` column — so every
 * statement that touches it is raw SQL here, and nowhere else. The vector is
 * always passed as a parameter cast to `::vector` rather than interpolated,
 * because a 384-number literal built by string concatenation is exactly the kind
 * of query that turns into an injection the day someone feeds it user input.
 */
import { Injectable } from '@nestjs/common';
import type { Locale } from '@smartestate/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { TranslationText } from './embedding-text.js';

/** A published listing and everything needed to decide whether to re-embed it. */
export interface EmbeddingCandidate {
  listingId: string;
  translations: TranslationText[];
  /** The model that produced the stored vector, if there is one. */
  storedModelVersion: string | null;
  /** The hash of the text that stored vector was made from, if there is one. */
  storedSourceHash: string | null;
}

/** One vector, with the two facts that say whether it is still current. */
export interface EmbeddingRow {
  listingId: string;
  modelVersion: string;
  sourceHash: string;
  embedding: readonly number[];
}

interface CandidateRow {
  listing_id: string;
  locale: Locale;
  title: string;
  description: string;
  source: string;
  stored_model_version: string | null;
  stored_source_hash: string | null;
}

@Injectable()
export class EmbeddingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every published listing with its translations and its current vector state.
   *
   * One query returning a row per translation, folded into a row per listing
   * here. `PUBLISHED` only: a draft is not searchable, so embedding it would
   * spend the encoder on text nobody can reach.
   */
  async candidates(listingIds?: readonly string[]): Promise<EmbeddingCandidate[]> {
    const filter =
      listingIds === undefined
        ? Prisma.sql`l.status = 'PUBLISHED'::"ListingStatus"`
        : Prisma.sql`l.id IN (${Prisma.join(listingIds.map((id) => Prisma.sql`${id}::uuid`))})`;

    const rows = await this.prisma.$queryRaw<CandidateRow[]>`
      SELECT l.id            AS listing_id,
             t.locale        AS locale,
             t.title         AS title,
             t.description   AS description,
             t.source::text  AS source,
             e.model_version AS stored_model_version,
             e.source_hash   AS stored_source_hash
      FROM listings l
      JOIN listing_translations t ON t.listing_id = l.id
      LEFT JOIN listing_embeddings e ON e.listing_id = l.id
      WHERE ${filter}
      ORDER BY l.id`;

    const byListing = new Map<string, EmbeddingCandidate>();
    for (const row of rows) {
      const existing = byListing.get(row.listing_id) ?? {
        listingId: row.listing_id,
        translations: [],
        storedModelVersion: row.stored_model_version,
        storedSourceHash: row.stored_source_hash,
      };
      existing.translations.push({
        locale: row.locale,
        title: row.title,
        description: row.description,
        source: row.source,
      });
      byListing.set(row.listing_id, existing);
    }
    return [...byListing.values()];
  }

  /**
   * Store vectors, replacing whatever was there.
   *
   * One statement per row inside a transaction: pgvector has no multi-row upsert
   * that keeps the parameter binding, and a backfill of a few hundred listings
   * does not need one. All or nothing, so a failure halfway does not leave the
   * catalogue half-embedded under two different models.
   */
  async upsert(rows: readonly EmbeddingRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await this.prisma.$transaction(
      rows.map(
        (row) => this.prisma.$executeRaw`
          INSERT INTO listing_embeddings (listing_id, model_version, source_hash, embedding)
          VALUES (${row.listingId}::uuid, ${row.modelVersion}, ${row.sourceHash},
                  ${toVectorLiteral(row.embedding)}::vector)
          ON CONFLICT (listing_id) DO UPDATE
            SET model_version = EXCLUDED.model_version,
                source_hash   = EXCLUDED.source_hash,
                embedding     = EXCLUDED.embedding,
                created_at    = now()`,
      ),
    );
  }

  /** How many listings carry a vector from each model. Reported by the backfill. */
  async countByModel(): Promise<{ modelVersion: string; count: number }[]> {
    const rows = await this.prisma.$queryRaw<{ model_version: string; count: bigint }[]>`
      SELECT model_version, count(*) AS count
      FROM listing_embeddings
      GROUP BY model_version
      ORDER BY count DESC`;
    return rows.map((row) => ({ modelVersion: row.model_version, count: Number(row.count) }));
  }

  /**
   * Drop vectors made by a model that is no longer loaded.
   *
   * A vector from other weights is not merely stale, it is meaningless next to a
   * current one: the two are points in different spaces and the distance between
   * them is arithmetic without a meaning. Leaving them would quietly corrupt
   * every ranking they appear in.
   */
  async deleteOtherModels(modelVersion: string): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM listing_embeddings WHERE model_version <> ${modelVersion}`;
  }
}

/** pgvector's text form: `[0.1,0.2,...]`. */
export function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(',')}]`;
}
