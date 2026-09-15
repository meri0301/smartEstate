/**
 * Keeping the vector index in step with the catalogue.
 *
 * Embedding is the one operation in this system that is expensive enough to be
 * worth not repeating, so the work is skipped when both the text and the model
 * are unchanged — that is what `source_hash` and `model_version` are stored for.
 * A backfill over an untouched catalogue does no encoding at all.
 *
 * Nothing here throws at a caller that was doing something else. A listing being
 * published must not fail because the encoder is down; the row simply keeps its
 * old vector, or none, and the next backfill catches it. Search degrades to
 * lexical in the meantime, which is the fallback the whole feature is built on.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  MlClient,
  MlUnavailableError,
  ML_MAX_EMBED_BATCH,
} from '../../infrastructure/ml/ml.client.js';
import { chooseTranslation, embeddableText, textHash } from './embedding-text.js';
import {
  EmbeddingsRepository,
  type EmbeddingCandidate,
  type EmbeddingRow,
} from './embeddings.repository.js';

/** What a backfill did, in the terms somebody running it wants to read. */
export interface BackfillReport {
  modelVersion: string;
  /** Listings that already had a current vector. */
  skipped: number;
  /** Listings embedded in this run. */
  embedded: number;
  /** Published listings with no usable text; nothing to embed. */
  withoutText: number;
  /** Vectors deleted because they came from other weights. */
  removedStale: number;
}

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private readonly repository: EmbeddingsRepository,
    private readonly ml: MlClient,
  ) {}

  /**
   * Embed everything published that needs it.
   *
   * Stale vectors are removed first rather than last: if the run fails halfway,
   * what is left behind is a partial index of current vectors, which searches
   * correctly on less data. Keeping the old ones would search incorrectly on
   * more, and nothing would say so.
   */
  async backfill(): Promise<BackfillReport> {
    const model = await this.ml.embeddingModel({ fresh: true });
    const removedStale = await this.repository.deleteOtherModels(model.modelVersion);
    if (removedStale > 0) {
      this.logger.log(
        `removed ${String(removedStale)} vectors from other weights; they are not comparable with ${model.modelVersion}`,
      );
    }

    const candidates = await this.repository.candidates();
    const report: BackfillReport = {
      modelVersion: model.modelVersion,
      skipped: 0,
      embedded: 0,
      withoutText: 0,
      removedStale,
    };

    const pending: { candidate: EmbeddingCandidate; text: string; hash: string }[] = [];
    for (const candidate of candidates) {
      const chosen = chooseTranslation(candidate.translations);
      if (chosen === undefined) {
        report.withoutText += 1;
        continue;
      }
      const text = embeddableText(chosen);
      const hash = textHash(chosen.locale, text);
      // `removedStale` has already deleted anything from other weights, so a
      // surviving row with a matching hash is current by both measures.
      if (
        candidate.storedSourceHash === hash &&
        candidate.storedModelVersion === model.modelVersion
      ) {
        report.skipped += 1;
        continue;
      }
      pending.push({ candidate, text, hash });
    }

    for (let start = 0; start < pending.length; start += ML_MAX_EMBED_BATCH) {
      const batch = pending.slice(start, start + ML_MAX_EMBED_BATCH);
      const answer = await this.ml.embed(
        batch.map((item) => item.text),
        'passage',
      );
      const rows: EmbeddingRow[] = batch.map((item, index) => ({
        listingId: item.candidate.listingId,
        modelVersion: answer.modelVersion,
        sourceHash: item.hash,
        embedding: answer.embeddings[index] ?? [],
      }));
      await this.repository.upsert(rows);
      report.embedded += rows.length;
    }

    return report;
  }

  /**
   * Embed one listing, without letting a failure reach the caller.
   *
   * Called when a listing becomes published. Publishing is the user's action and
   * the encoder is an implementation detail of search; a person who has just had
   * their listing approved should not see an error because a container is
   * restarting.
   */
  async embedListing(listingId: string): Promise<void> {
    try {
      const [candidate] = await this.repository.candidates([listingId]);
      if (candidate === undefined) {
        return;
      }
      const chosen = chooseTranslation(candidate.translations);
      if (chosen === undefined) {
        return;
      }
      const text = embeddableText(chosen);
      const hash = textHash(chosen.locale, text);
      const model = await this.ml.embeddingModel();
      if (
        candidate.storedSourceHash === hash &&
        candidate.storedModelVersion === model.modelVersion
      ) {
        return;
      }
      const answer = await this.ml.embed([text], 'passage');
      const embedding = answer.embeddings[0];
      if (embedding === undefined) {
        return;
      }
      await this.repository.upsert([
        { listingId, modelVersion: answer.modelVersion, sourceHash: hash, embedding },
      ]);
    } catch (error) {
      if (!(error instanceof MlUnavailableError)) {
        throw error;
      }
      this.logger.warn(
        { err: error, listingId },
        'listing published without a vector; the next backfill will embed it',
      );
    }
  }

  /** What the index currently holds, for the backfill's closing summary. */
  countByModel(): Promise<{ modelVersion: string; count: number }[]> {
    return this.repository.countByModel();
  }
}
