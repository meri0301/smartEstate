import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { MlUnavailableError, type MlClient } from '../../infrastructure/ml/ml.client.js';
import type { ListingRow } from '../listings/listing-row.js';
import type { ListingsRepository } from '../listings/listings.repository.js';
import type { ValuationRepository, StoredValuation } from './valuation.repository.js';
import { isCurrent, ValuationService } from './valuation.service.js';

const LISTING_ID = '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f';
const MODEL = 'valuation-lgbm-20260914-65982e00';

const row = (overrides: Partial<ListingRow> = {}): ListingRow => ({
  id: LISTING_ID,
  public_id: 'L-ABC234',
  status: 'PUBLISHED',
  price_amd: 45_000_000n,
  price_per_sqm_amd: 625_000,
  original_currency: 'AMD',
  original_price: null,
  price_negotiable: false,
  rooms: 3,
  bathrooms: 1,
  total_area: { toString: () => '72.00' },
  living_area: null,
  kitchen_area: null,
  ceiling_height: null,
  floor: 4,
  balcony_count: 1,
  has_loggia: false,
  has_parking: false,
  has_storage: false,
  condition: 'GOOD',
  heating: 'ELECTRIC',
  ownership_docs: 'UNVERIFIED',
  lon: 44.51,
  lat: 40.18,
  published_at: new Date('2026-08-20T10:00:00.000Z'),
  submitted_at: null,
  reviewed_at: null,
  reviewed_by_id: null,
  rejection_reason: null,
  created_at: new Date('2026-08-20T10:00:00.000Z'),
  updated_at: new Date('2026-08-21T10:00:00.000Z'),
  created_by_id: null,
  building_id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e70',
  district_id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e71',
  b_address_line: 'Komitas 12',
  b_street_hy: 'Կոմիտաս',
  b_street_ru: 'Комитаса',
  b_street_en: 'Komitas',
  b_house_number: '12',
  b_building_type: 'STONE',
  b_construction_year: 1978,
  b_total_floors: 9,
  b_has_elevator: true,
  b_seismic_retrofit: false,
  b_lon: 44.51,
  b_lat: 40.18,
  d_slug: 'arabkir',
  d_name_hy: 'Արաբկիր',
  d_name_ru: 'Арабкир',
  d_name_en: 'Arabkir',
  ...overrides,
});

const storedValuation = (overrides: Partial<StoredValuation> = {}): StoredValuation => ({
  modelVersion: MODEL,
  fairPriceAmd: 39_600_000,
  lowerBoundAmd: 30_000_000,
  upperBoundAmd: 50_000_000,
  deviationPct: 13.64,
  verdict: 'FAIR',
  factors: [{ feature: 'district_slug', value: 'arabkir', effect: 0.2, impactAmd: 6_600_000 }],
  // After the listing's updated_at, so it describes the listing as it stands.
  createdAt: new Date('2026-08-22T10:00:00.000Z'),
  ...overrides,
});

const explanation = {
  modelVersion: MODEL,
  estimate: {
    pricePerSqmAmd: 550_000,
    priceAmd: 39_600_000,
    lowPriceAmd: 30_000_000,
    highPriceAmd: 50_000_000,
  },
  baselinePricePerSqmAmd: 500_000,
  contributions: [
    { feature: 'district_slug', value: 'arabkir', effect: 0.2, logContribution: 0.1823 },
  ],
  deviation: 0.1364,
  verdict: 'FAIR' as const,
};

function harness() {
  const listings = { findRowById: vi.fn().mockResolvedValue(row()) };
  const valuations = {
    findLatest: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockResolvedValue(undefined),
  };
  const ml = {
    modelVersion: vi.fn().mockResolvedValue(MODEL),
    explain: vi.fn().mockResolvedValue(explanation),
  };
  const service = new ValuationService(
    listings as unknown as ListingsRepository,
    valuations as unknown as ValuationRepository,
    ml as unknown as MlClient,
  );
  return { listings, valuations, ml, service };
}

describe('isCurrent', () => {
  it('accepts a valuation from this model taken after the listing last changed', () => {
    expect(isCurrent(storedValuation(), MODEL, row())).toBe(true);
  });

  it('rejects one from an older model', () => {
    expect(isCurrent(storedValuation(), 'valuation-lgbm-20261001-aaaaaaaa', row())).toBe(false);
  });

  it('rejects one taken before the listing was last edited', () => {
    expect(
      isCurrent(storedValuation({ createdAt: new Date('2026-08-20T00:00:00.000Z') }), MODEL, row()),
    ).toBe(false);
  });
});

describe('ValuationService', () => {
  let context: ReturnType<typeof harness>;

  beforeEach(() => {
    context = harness();
  });

  it('values a listing that has never been valued, and writes the result down', async () => {
    const valuation = await context.service.forListing(LISTING_ID, undefined);

    expect(context.ml.explain).toHaveBeenCalledOnce();
    expect(valuation.fairPriceAmd).toBe(39_600_000);
    expect(valuation.verdict).toBe('FAIR');
    expect(valuation.isStale).toBe(false);
    expect(context.valuations.insert).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: LISTING_ID, modelVersion: MODEL }),
    );
  });

  it('sends the asking price, so the model can judge it', async () => {
    await context.service.forListing(LISTING_ID, undefined);

    expect(context.ml.explain).toHaveBeenCalledWith(
      expect.objectContaining({ districtSlug: 'arabkir' }),
      45_000_000,
    );
  });

  it('reuses a current valuation instead of asking the model again', async () => {
    context.valuations.findLatest.mockResolvedValue(storedValuation());

    const valuation = await context.service.forListing(LISTING_ID, undefined);

    expect(context.ml.explain).not.toHaveBeenCalled();
    expect(context.valuations.insert).not.toHaveBeenCalled();
    expect(valuation.fairPriceAmd).toBe(39_600_000);
    expect(valuation.isStale).toBe(false);
  });

  it('revalues when the model has been retrained since', async () => {
    context.valuations.findLatest.mockResolvedValue(
      storedValuation({ modelVersion: 'valuation-lgbm-20250101-deadbeef' }),
    );

    await context.service.forListing(LISTING_ID, undefined);

    expect(context.ml.explain).toHaveBeenCalledOnce();
  });

  it('revalues when the listing itself has changed since', async () => {
    context.valuations.findLatest.mockResolvedValue(
      storedValuation({ createdAt: new Date('2026-08-20T00:00:00.000Z') }),
    );

    await context.service.forListing(LISTING_ID, undefined);

    expect(context.ml.explain).toHaveBeenCalledOnce();
  });

  it('serves the last known valuation when the model service is unreachable', async () => {
    context.valuations.findLatest.mockResolvedValue(storedValuation());
    context.ml.modelVersion.mockRejectedValue(new MlUnavailableError('connection refused'));

    const valuation = await context.service.forListing(LISTING_ID, undefined);

    expect(valuation.fairPriceAmd).toBe(39_600_000);
    expect(valuation.isStale).toBe(false);
    expect(context.ml.explain).not.toHaveBeenCalled();
  });

  it('marks the last known valuation out of date when the listing moved on without it', async () => {
    context.valuations.findLatest.mockResolvedValue(
      storedValuation({ createdAt: new Date('2026-08-20T00:00:00.000Z') }),
    );
    context.ml.modelVersion.mockRejectedValue(new MlUnavailableError('connection refused'));

    const valuation = await context.service.forListing(LISTING_ID, undefined);

    expect(valuation.isStale).toBe(true);
  });

  it('reports unavailable when there is no model and nothing was ever stored', async () => {
    context.ml.modelVersion.mockRejectedValue(new MlUnavailableError('no model is loaded'));

    await expect(context.service.forListing(LISTING_ID, undefined)).rejects.toBeInstanceOf(
      MlUnavailableError,
    );
  });

  it('does not confirm that an unpublished listing exists', async () => {
    const stranger: AuthenticatedUser = {
      id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e02',
      email: 'c@d.co',
      role: 'USER',
      locale: 'en',
    };
    context.listings.findRowById.mockResolvedValue(row({ status: 'DRAFT' }));

    await expect(context.service.forListing(LISTING_ID, stranger)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(context.ml.explain).not.toHaveBeenCalled();
  });

  it('404s an unknown listing', async () => {
    context.listings.findRowById.mockResolvedValue(undefined);

    await expect(context.service.forListing(LISTING_ID, undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
