/**
 * Finding the better options for the listing somebody is looking at.
 *
 * Three steps, and the first is the one that decides whether the answer is any
 * good: choosing what counts as an alternative at all.
 *
 * **Comparable, not merely similar.** A candidate has to be something the buyer
 * could actually switch to — the same district, at least as many rooms, and not
 * meaningfully more expensive. Those three are filters rather than criteria
 * because none of them has a direction a buyer would agree with in the
 * abstract: nobody looking at a two-room flat in Arabkir wants to be told about
 * a four-room house in Gyumri, however good it is.
 *
 * **Dominance, then trade-offs.** Each candidate is compared with the subject
 * and ordered: the ones that give up nothing first, then the ones that ask
 * something in exchange. A candidate that is worse on something and better on
 * nothing is dropped — there is no sentence to write about it that a buyer would
 * want to read.
 *
 * **Nothing is a real answer.** A listing with no better options is common and
 * is worth saying plainly; padding the page with near-misses would turn "this is
 * a good buy" into "here are some other flats", which is the failure mode the
 * whole feature exists to avoid.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  COMPARISON_CRITERIA,
  type AlternativeListing,
  type AlternativesQuery,
  type AlternativesResponse,
  type Locale,
} from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { MlClient, MlUnavailableError } from '../../infrastructure/ml/ml.client.js';
import { can } from '../listings/listing.policy.js';
import { subjectOf } from '../listings/listings.service.js';
import type { ListingRow } from '../listings/listing-row.js';
import { toListingSummary } from '../listings/listing.mapper.js';
import { ListingsRepository } from '../listings/listings.repository.js';
import { toFeatures } from '../valuation/valuation.mapper.js';
import { compare, comparableCriteria, toComparable, type ComparisonContext } from './dominance.js';

/**
 * How much more a candidate may cost and still be an alternative.
 *
 * "Better located for similar money" is the brief's phrase, and ten per cent is
 * what similar money means here: enough that a genuinely better flat is not
 * excluded by a rounding difference, little enough that the page never answers
 * "spend more" to somebody who did not ask.
 */
export const PRICE_CEILING_RATIO = 1.1;

/**
 * How many listings are examined.
 *
 * One batch to the model service, as elsewhere, and far more than a district
 * holds at any one price point on a catalogue this size.
 */
const CANDIDATE_LIMIT = 100;

/** A candidate and the comparison that placed it. */
interface ComparedCandidate {
  row: ListingRow;
  relation: AlternativeListing['relation'];
  comparisons: AlternativeListing['comparisons'];
  betterCount: number;
  worseCount: number;
}

@Injectable()
export class AlternativesService {
  private readonly logger = new Logger(AlternativesService.name);

  constructor(
    private readonly listings: ListingsRepository,
    private readonly ml: MlClient,
  ) {}

  /**
   * Better options for one listing.
   *
   * The same visibility rule as the listing itself: one the caller may not see
   * does not exist, and neither do its alternatives. Everything compared against
   * it is published, so the answer never reveals a draft by describing it.
   */
  async forListing(
    listingId: string,
    viewer: AuthenticatedUser | undefined,
    query: AlternativesQuery,
    locale: Locale,
  ): Promise<AlternativesResponse> {
    const subject = await this.listings.findRowById(listingId);
    if (subject === undefined || !can(viewer, 'view', subjectOf(subject)).allowed) {
      throw new NotFoundException({ message: 'Listing not found', code: 'NOT_FOUND' });
    }

    const candidates = await this.candidates(subject);
    const context = await this.context(subject, candidates, query);

    const subjectVector = toComparable(subject, context);
    const compared = candidates
      .map((row) => ({ row, ...compare(subjectVector, toComparable(row, context)) }))
      // Worse at something and better at nothing is not an alternative, it is a
      // reason to stay where you are.
      .filter((entry) => entry.betterCount > 0)
      .sort(byRelationThenGains);

    const chosen = compared.slice(0, query.limit);
    const alternatives = await this.hydrate(chosen, locale);

    // Established from the subject's own vector: a criterion it has no value for
    // could not have been compared against anything.
    const criteria = comparableCriteria(subjectVector, subjectVector);

    return {
      subject: await this.summarise(subject, locale),
      criteria,
      omittedCriteria: COMPARISON_CRITERIA.filter((criterion) => !criteria.includes(criterion)),
      candidateCount: candidates.length,
      alternatives,
    };
  }

  /**
   * The listings a buyer could actually switch to.
   *
   * Same district, at least as many rooms, and no more than a tenth dearer. The
   * subject itself is excluded, obviously, and so is anything unpublished: an
   * alternative somebody cannot buy is not an alternative.
   */
  private async candidates(subject: ListingRow): Promise<ListingRow[]> {
    const priceCeiling = Math.round(Number(String(subject.price_amd)) * PRICE_CEILING_RATIO);
    const rows = await this.listings.search(
      {
        limit: CANDIDATE_LIMIT,
        sort: 'price_asc',
        status: 'PUBLISHED',
        mine: false,
        districts: [subject.d_slug],
        roomsMin: subject.rooms,
        priceMax: priceCeiling,
      },
      {},
    );
    // The search returns one extra row to detect a next page; trimming keeps the
    // batch inside the model service's limit.
    return rows.slice(0, CANDIDATE_LIMIT).filter((row) => row.id !== subject.id);
  }

  /**
   * What can be measured for this comparison.
   *
   * The anchor comes from the caller. The deviations come from the model service
   * in one batch covering the subject and every candidate, because `value` can
   * only be compared when both sides of a pair have one.
   */
  private async context(
    subject: ListingRow,
    candidates: readonly ListingRow[],
    query: AlternativesQuery,
  ): Promise<ComparisonContext> {
    const context: ComparisonContext =
      query.anchorLat === undefined || query.anchorLon === undefined
        ? {}
        : { anchor: { lat: query.anchorLat, lon: query.anchorLon } };
    const rows = [subject, ...candidates];
    try {
      const prediction = await this.ml.predict(rows.map((row) => toFeatures(row)));
      const deviations = new Map<string, number>();
      rows.forEach((row, index) => {
        const estimate = prediction.estimates[index];
        if (estimate !== undefined && estimate.priceAmd > 0) {
          deviations.set(row.id, (Number(String(row.price_amd)) / estimate.priceAmd - 1) * 100);
        }
      });
      context.deviations = deviations;
    } catch (error) {
      if (!(error instanceof MlUnavailableError)) {
        throw error;
      }
      this.logger.warn(
        { err: error },
        'comparing without the value criterion; no model is available',
      );
    }
    return context;
  }

  private async hydrate(
    chosen: readonly ComparedCandidate[],
    locale: Locale,
  ): Promise<AlternativeListing[]> {
    const ids = chosen.map((entry) => entry.row.id);
    if (ids.length === 0) {
      return [];
    }
    const [translations, thumbnails] = await Promise.all([
      this.listings.findTranslations(ids),
      this.listings.findThumbnails(ids),
    ]);
    return chosen.map((entry) => ({
      listing: toListingSummary(
        entry.row,
        translations.filter((translation) => translation.listingId === entry.row.id),
        thumbnails.find((media) => media.listingId === entry.row.id),
        locale,
      ),
      relation: entry.relation,
      comparisons: entry.comparisons,
      betterCount: entry.betterCount,
      worseCount: entry.worseCount,
    }));
  }

  private async summarise(
    row: ListingRow,
    locale: Locale,
  ): Promise<AlternativesResponse['subject']> {
    const [translations, thumbnails] = await Promise.all([
      this.listings.findTranslations([row.id]),
      this.listings.findThumbnails([row.id]),
    ]);
    return toListingSummary(row, translations, thumbnails[0], locale);
  }
}

/**
 * Dominant options first, then the trade-offs that ask least in return.
 *
 * Within each group, more gains beats fewer, and fewer losses beats more. That
 * ordering is a presentation choice and not a claim: two trade-offs are not
 * comparable without knowing what the buyer values, which is precisely what the
 * recommender asks them and this page does not.
 */
function byRelationThenGains(a: ComparedCandidate, b: ComparedCandidate): number {
  const rank = (entry: ComparedCandidate): number => (entry.relation === 'DOMINATES' ? 0 : 1);
  if (rank(a) !== rank(b)) {
    return rank(a) - rank(b);
  }
  if (a.worseCount !== b.worseCount) {
    return a.worseCount - b.worseCount;
  }
  return b.betterCount - a.betterCount;
}
