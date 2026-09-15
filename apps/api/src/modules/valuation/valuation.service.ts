/**
 * What a listing is worth, and how the product behaves when it cannot say.
 *
 * Three rules shape this service:
 *
 * 1. **Nothing is recomputed without reason.** A valuation is reused while the
 *    listing has not changed and the model has not moved on. Calling the model
 *    again for an unchanged listing would burn time and, worse, produce a second
 *    stored figure that differs from the first for no reason a user could see.
 * 2. **A dead model service is not a dead listing page.** If the model cannot be
 *    reached, the last stored valuation is served instead, marked as out of
 *    date. Only when there is nothing stored either does the caller get a 503.
 * 3. **Every figure is written down** with the model version that produced it.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Valuation } from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { MlClient, MlUnavailableError } from '../../infrastructure/ml/ml.client.js';
import type { ListingRow } from '../listings/listing-row.js';
import { ListingsRepository } from '../listings/listings.repository.js';
import { can } from '../listings/listing.policy.js';
import { subjectOf } from '../listings/listings.service.js';
import { toFeatures, toValuation } from './valuation.mapper.js';
import { ValuationRepository, type StoredValuation } from './valuation.repository.js';

@Injectable()
export class ValuationService {
  private readonly logger = new Logger(ValuationService.name);

  constructor(
    private readonly listings: ListingsRepository,
    private readonly valuations: ValuationRepository,
    private readonly ml: MlClient,
  ) {}

  async forListing(listingId: string, viewer: AuthenticatedUser | undefined): Promise<Valuation> {
    const row = await this.listings.findRowById(listingId);
    // The same rule as the listing itself: a listing the caller may not see does
    // not exist, and neither does its valuation.
    if (row === undefined || !can(viewer, 'view', subjectOf(row)).allowed) {
      throw new NotFoundException({ message: 'Listing not found', code: 'NOT_FOUND' });
    }

    const stored = await this.valuations.findLatest(listingId);
    const askingPriceAmd = Number(String(row.price_amd));

    let currentVersion: string | undefined;
    try {
      currentVersion = await this.ml.modelVersion();
    } catch (error) {
      if (!(error instanceof MlUnavailableError)) {
        throw error;
      }
      if (stored === undefined) {
        throw error;
      }
      this.logger.warn(
        { listingId, err: error },
        'serving a stored valuation; the model service is unreachable',
      );
      return fromStored(listingId, stored, row);
    }

    if (stored !== undefined && isCurrent(stored, currentVersion, row)) {
      return fromStored(listingId, stored, row);
    }

    const explanation = await this.ml.explain(toFeatures(row), askingPriceAmd);
    const valuation = toValuation({
      listingId,
      askingPriceAmd,
      explanation,
      calculatedAt: new Date(),
      isStale: false,
    });
    await this.valuations.insert(valuation);
    return valuation;
  }
}

/**
 * Whether a stored valuation still describes the listing.
 *
 * Both halves matter. A listing whose price or attributes changed has a
 * valuation about a property that no longer exists, and a valuation from an
 * older model is not comparable with the ones around it.
 */
export function isCurrent(
  stored: StoredValuation,
  currentModelVersion: string,
  row: ListingRow,
): boolean {
  return stored.modelVersion === currentModelVersion && stored.createdAt >= row.updated_at;
}

/**
 * Rebuilds the published shape from a stored record.
 *
 * `isStale` is computed from the one fact that is always knowable, whether the
 * listing changed after the valuation was taken. Whether the model has since
 * moved on cannot be checked while the model service is down, and claiming
 * otherwise would be a guess.
 */
function fromStored(listingId: string, stored: StoredValuation, row: ListingRow): Valuation {
  return {
    listingId,
    modelVersion: stored.modelVersion,
    fairPriceAmd: stored.fairPriceAmd,
    lowerBoundAmd: stored.lowerBoundAmd,
    upperBoundAmd: stored.upperBoundAmd,
    deviationPct: stored.deviationPct,
    verdict: stored.verdict,
    factors: stored.factors,
    calculatedAt: stored.createdAt.toISOString(),
    isStale: stored.createdAt < row.updated_at,
  };
}
