/**
 * Ranking listings against a buyer's stated preferences.
 *
 * The shape of a run: narrow the catalogue with the buyer's hard limits, score
 * what survives on every criterion, combine the criteria by the chosen method,
 * and write the whole thing down. The last step is not bookkeeping. The thesis
 * compares ranking strategies, and a comparison needs the inputs, the outputs
 * and the strategy of every run recorded from the first day the recommender
 * exists, not from the day someone remembers to add logging.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  RANKING_CRITERIA,
  type Locale,
  type PreferenceProfile,
  type RankedListing,
  type RecommendationRequest,
  type RecommendationResponse,
} from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { uuidV7 } from '../../common/ids/uuid-v7.js';
import { MlClient, MlUnavailableError } from '../../infrastructure/ml/ml.client.js';
import type { ListingRow } from '../listings/listing-row.js';
import { toListingSummary } from '../listings/listing.mapper.js';
import { ListingsRepository } from '../listings/listings.repository.js';
import { toFeatures } from '../valuation/valuation.mapper.js';
import { scoreCriteria } from './criteria.js';
import { explain } from './explanation.js';
import {
  ExplanationsService,
  wasModelContacted,
  type ExplanationSubject,
} from './explanations.service.js';
import { normaliseWeights, rank, usableCriteria } from './mcda.js';
import { RecommendationsRepository } from './recommendations.repository.js';

/**
 * How many listings are scored before the top ones are returned.
 *
 * Large enough that the ranking has something to choose between, small enough
 * that one request is one batch to the model service.
 */
const CANDIDATE_LIMIT = 100;

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly listings: ListingsRepository,
    private readonly sessions: RecommendationsRepository,
    private readonly ml: MlClient,
    private readonly explanations: ExplanationsService,
  ) {}

  async recommend(
    request: RecommendationRequest,
    viewer: AuthenticatedUser | undefined,
    locale: Locale,
  ): Promise<RecommendationResponse> {
    const { preferences } = request;
    // The search fetches one more row than asked for, to detect a next page.
    // Ranking has no pages, and that extra row would push the batch one over the
    // model service's limit and cost the whole run its value criterion.
    const candidates = (
      await this.listings.search(
        {
          limit: CANDIDATE_LIMIT,
          sort: 'published_desc',
          status: 'PUBLISHED',
          mine: false,
          // The buyer's limits are filters, not criteria: no amount of charm makes
          // a listing over budget the right answer to "my budget is this".
          priceMax: preferences.budgetAmd,
          roomsMin: preferences.roomsMin,
          ...(preferences.roomsMax === undefined ? {} : { roomsMax: preferences.roomsMax }),
          ...(preferences.areaMin === undefined ? {} : { areaMin: preferences.areaMin }),
          ...(preferences.districts.length === 0 ? {} : { districts: preferences.districts }),
        },
        {},
      )
    ).slice(0, CANDIDATE_LIMIT);

    const deviations = await this.deviations(candidates);
    const scored = candidates.map((row) => ({
      candidate: row,
      scores: scoreCriteria({ row, deviationPct: deviations.get(row.id) }, preferences),
    }));

    const usable = usableCriteria(
      scored.map((entry) => entry.scores),
      RANKING_CRITERIA,
    );
    const omittedCriteria = RANKING_CRITERIA.filter((criterion) => !usable.includes(criterion));
    const weights = normaliseWeights(preferences.weights, usable);

    const ranked = rank(request.method, scored, weights).slice(0, request.limit);
    const items = await this.hydrate(ranked, preferences, deviations, locale);

    // The reasons are already complete; this only decides whether a model is
    // asked to phrase them, and a paragraph it writes is used only if every
    // number in it is one it was given.
    const phrased = request.explain
      ? await this.explanations.phrase(items.map(toSubject), locale)
      : { texts: new Map<string, string>(), source: 'disabled' as const, trace: undefined };

    for (const item of items) {
      const text = phrased.texts.get(item.listing.id);
      if (text !== undefined) {
        item.explanation.text = text;
      }
    }

    const sessionId = uuidV7();
    const createdAt = new Date();
    await this.sessions.insert({
      id: sessionId,
      userId: viewer?.id ?? null,
      strategy: request.strategy,
      experimentKey: request.experimentKey ?? null,
      preferences: {
        ...request.preferences,
        method: request.method,
        candidateCount: candidates.length,
        omittedCriteria,
        // Recorded with the run rather than only returned, so the evaluation can
        // say how many of the stored rankings a model ever spoke about.
        explanationSource: phrased.source,
      },
      results: items.map((item) => ({
        listingId: item.listing.id,
        rank: item.rank,
        score: item.score,
        breakdown: item.breakdown,
        explanation: item.explanation,
      })),
      // Stored beside the ranking it explains rather than in a table of its own,
      // so a paragraph can be reproduced months later from the prompt and model
      // that produced it. Null when no model was reached, because a prompt that
      // was never sent is not evidence of anything and every run would carry one.
      llmTrace:
        phrased.trace !== undefined && wasModelContacted(phrased.source)
          ? { ...phrased.trace }
          : null,
    });

    return {
      sessionId,
      strategy: request.strategy,
      method: request.method,
      candidateCount: candidates.length,
      omittedCriteria,
      explanationSource: phrased.source,
      items,
      createdAt: createdAt.toISOString(),
    };
  }

  /**
   * How each candidate's asking price compares with the model's estimate.
   *
   * One batch call for the whole candidate set. When the model service cannot
   * answer, the map comes back empty, the `value` criterion becomes unusable for
   * every candidate, and the ranking proceeds on the rest with their weights
   * redistributed. The response says which criteria were dropped, because a
   * ranking computed on six criteria instead of seven is a different ranking and
   * the caller is entitled to know.
   */
  private async deviations(rows: readonly ListingRow[]): Promise<Map<string, number>> {
    const deviations = new Map<string, number>();
    if (rows.length === 0) {
      return deviations;
    }
    try {
      const prediction = await this.ml.predict(rows.map((row) => toFeatures(row)));
      rows.forEach((row, index) => {
        const estimate = prediction.estimates[index];
        const asking = Number(String(row.price_amd));
        if (estimate !== undefined && estimate.priceAmd > 0) {
          deviations.set(row.id, (asking / estimate.priceAmd - 1) * 100);
        }
      });
    } catch (error) {
      if (!(error instanceof MlUnavailableError)) {
        throw error;
      }
      this.logger.warn({ err: error }, 'ranking without the value criterion; no model available');
      deviations.clear();
    }
    return deviations;
  }

  /**
   * Turns ranked rows into the summaries the client renders.
   *
   * The explanation is computed here rather than later because this is where the
   * row, the breakdown and the preferences are all still in scope. It is the
   * answer to "why this one?" on its own; anything a model adds later is
   * phrasing on top of it.
   */
  private async hydrate(
    ranked: readonly {
      candidate: ListingRow;
      score: number;
      breakdown: RankedListing['breakdown'];
    }[],
    preferences: PreferenceProfile,
    deviations: ReadonlyMap<string, number>,
    locale: Locale,
  ): Promise<RankedListing[]> {
    const ids = ranked.map((entry) => entry.candidate.id);
    const [translations, thumbnails] = await Promise.all([
      this.listings.findTranslations(ids),
      this.listings.findThumbnails(ids),
    ]);
    return ranked.map((entry, index) => ({
      listing: toListingSummary(
        entry.candidate,
        translations.filter((translation) => translation.listingId === entry.candidate.id),
        thumbnails.find((media) => media.listingId === entry.candidate.id),
        locale,
      ),
      rank: index + 1,
      score: roundTo(entry.score, 4),
      breakdown: entry.breakdown.map((item) => ({
        ...item,
        score: roundTo(item.score, 4),
        weight: roundTo(item.weight, 4),
        contribution: roundTo(item.contribution, 4),
      })),
      explanation: explain({
        row: entry.candidate,
        breakdown: entry.breakdown,
        preferences,
        deviationPct: deviations.get(entry.candidate.id),
      }),
    }));
  }
}

/** What the model is told about one result: figures, and nothing else. */
function toSubject(item: RankedListing): ExplanationSubject {
  return {
    listingId: item.listing.id,
    rank: item.rank,
    priceAmd: item.listing.priceAmd,
    areaSqm: item.listing.totalArea,
    rooms: item.listing.rooms,
    explanation: item.explanation,
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
