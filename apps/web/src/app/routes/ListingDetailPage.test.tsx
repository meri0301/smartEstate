import { QueryClientProvider } from '@tanstack/react-query';
import type { ListingDetail, Valuation } from '@smartestate/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../shared/api/query-client.js';
import { routes } from '../router.js';

vi.mock('../../features/map/index.js', () => ({
  ListingMap: ({ label }: { label: string }) => <div data-testid="map" aria-label={label} />,
}));

const detail = (overrides: Partial<ListingDetail> = {}): ListingDetail => ({
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
  publicId: 'L-ABC234',
  status: 'PUBLISHED',
  locale: 'en',
  title: 'Bright three-room flat',
  description: 'Renovated apartment on the fourth floor.',
  priceAmd: 45_000_000,
  pricePerSqmAmd: 625_000,
  originalCurrency: 'AMD',
  originalPrice: null,
  priceNegotiable: true,
  rooms: 3,
  totalArea: 72,
  livingArea: 48,
  kitchenArea: 9.5,
  bathrooms: 1,
  ceilingHeight: 2.8,
  balconyCount: 1,
  hasLoggia: false,
  hasParking: false,
  hasStorage: true,
  floor: 4,
  totalFloors: 9,
  buildingType: 'STONE',
  condition: 'GOOD',
  heating: 'INDIVIDUAL_GAS_BOILER',
  ownershipDocs: 'VERIFIED',
  district: { slug: 'arabkir', name: { hy: 'Արաբկիր', ru: 'Арабкир', en: 'Arabkir' } },
  location: { lat: 40.2, lon: 44.5 },
  thumbnailUrl: 'https://example.test/1.jpg',
  publishedAt: '2026-09-01T00:00:00.000Z',
  building: {
    id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e70',
    districtId: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e71',
    addressLine: 'Komitas 12',
    street: { hy: 'Կոմիտաս', ru: 'Комитаса', en: 'Komitas' },
    houseNumber: '12',
    buildingType: 'STONE',
    constructionYear: 1978,
    totalFloors: 9,
    hasElevator: true,
    seismicRetrofit: false,
    location: { lat: 40.2, lon: 44.5 },
  },
  media: [
    {
      id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e72',
      kind: 'PHOTO',
      url: 'https://example.test/1.jpg',
      width: 1200,
      height: 800,
      sortOrder: 0,
      isPlaceholder: true,
    },
    {
      id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e73',
      kind: 'PHOTO',
      url: 'https://example.test/2.jpg',
      width: 1200,
      height: 800,
      sortOrder: 1,
      isPlaceholder: true,
    },
  ],
  translations: [
    {
      locale: 'en',
      title: 'Bright three-room flat',
      description: 'Renovated apartment on the fourth floor.',
      isMachineTranslated: false,
    },
  ],
  priceHistory: [
    { priceAmd: 48_000_000, recordedAt: '2026-08-01T00:00:00.000Z' },
    { priceAmd: 45_000_000, recordedAt: '2026-09-01T00:00:00.000Z' },
  ],
  createdById: null,
  rejectionReason: null,
  reviewedAt: null,
  submittedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const valuation = (overrides: Partial<Valuation> = {}): Valuation => ({
  listingId: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
  modelVersion: 'valuation-lgbm-20260914-65982e00',
  fairPriceAmd: 39_600_000,
  lowerBoundAmd: 30_000_000,
  upperBoundAmd: 50_000_000,
  deviationPct: 13.64,
  verdict: 'OVERPRICED',
  factors: [
    { feature: 'district_slug', value: 'arabkir', effect: 0.2, impactAmd: 6_600_000 },
    { feature: 'is_ground_floor', value: 1, effect: -0.06, impactAmd: -2_400_000 },
  ],
  calculatedAt: '2026-09-15T08:00:00.000Z',
  isStale: false,
  ...overrides,
});

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

interface StubOptions {
  /** Status and body for the listing itself. */
  status?: number;
  body?: unknown;
  /** The valuation, or a status to fail it with. Omitted means 503, as it would be with no model. */
  valuation?: Valuation;
  valuationStatus?: number;
}

/** Routes by path, because the page asks for the listing and its valuation separately. */
function stubApi(options: StubOptions = {}): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = new URL((input as Request).url);
    if (url.pathname.endsWith('/valuation')) {
      return Promise.resolve(
        options.valuation === undefined
          ? json(options.valuationStatus ?? 503, {
              statusCode: options.valuationStatus ?? 503,
              error: 'Service Unavailable',
              message: 'No model',
              code: 'ML_UNAVAILABLE',
            })
          : json(200, options.valuation),
      );
    }
    return Promise.resolve(json(options.status ?? 200, options.body ?? detail()));
  });
}

/** Shorthand for the many tests that only care about the listing. */
function stub(status: number, body: unknown): void {
  stubApi({ status, body });
}

function renderDetail(path = '/en/listings/L-ABC234') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('the listing detail screen', () => {
  it('leads with the title, the price and where it is', async () => {
    stub(200, detail());
    renderDetail();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bright three-room flat' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Komitas 12')).toBeInTheDocument();
    expect(screen.getByText('L-ABC234')).toBeInTheDocument();
  });

  it('asks the API in the language of the page', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(detail()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    renderDetail('/ru/listings/L-ABC234');

    await screen.findByRole('heading', { level: 1 });
    const url = new URL((fetchSpy.mock.calls[0]?.[0] as Request).url);
    expect(url.pathname).toBe('/api/listings/L-ABC234');
    expect(url.searchParams.get('locale')).toBe('ru');
  });

  it('lists the attributes that have a value and leaves out the ones that do not', async () => {
    stub(200, detail({ livingArea: null, ceilingHeight: null }));
    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.queryByText('Living area')).not.toBeInTheDocument();
    expect(screen.queryByText('Ceiling height')).not.toBeInTheDocument();
  });

  it('shows the price history with the change against the previous figure', async () => {
    stub(200, detail());
    renderDetail();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('-6.3%')).toBeInTheDocument();
  });

  it('hides the price history when there has only ever been one price', async () => {
    stub(
      200,
      detail({ priceHistory: [{ priceAmd: 45_000_000, recordedAt: '2026-09-01T00:00:00.000Z' }] }),
    );
    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('lets the reader step through the photographs', async () => {
    stub(200, detail());
    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    const gallery = screen.getByRole('list', { name: 'Photographs' });
    const thumbnails = within(gallery).getAllByRole('button');
    expect(thumbnails).toHaveLength(2);

    const [, second] = thumbnails;
    if (second === undefined) {
      throw new Error('expected a second thumbnail');
    }
    await userEvent.click(second);
    expect(
      screen.getByRole('img', { name: 'Bright three-room flat, photograph 2 of 2' }),
    ).toBeInTheDocument();
  });

  it('warns that the text was translated by a machine', async () => {
    stub(
      200,
      detail({
        translations: [
          {
            locale: 'en',
            title: 'Bright three-room flat',
            description: 'Renovated apartment.',
            isMachineTranslated: true,
          },
        ],
      }),
    );
    renderDetail();

    expect(await screen.findByText('Translated automatically')).toBeInTheDocument();
  });

  it('explains a listing that is not there instead of showing an error code', async () => {
    stub(404, { statusCode: 404, error: 'Not Found', message: 'Listing not found' });
    renderDetail();

    expect(await screen.findByText('This listing is not available')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to search' })).toHaveAttribute(
      'href',
      '/en/listings',
    );
  });

  it('marks a listing that is not published', async () => {
    stub(200, detail({ status: 'PENDING_REVIEW' }));
    renderDetail();

    expect(await screen.findByText('Awaiting review')).toBeInTheDocument();
  });
});

describe('the price check', () => {
  it('shows the verdict, the estimate and the range', async () => {
    stubApi({ valuation: valuation() });
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Price check' })).toBeInTheDocument();
    expect(screen.getByText('Above the estimate')).toBeInTheDocument();
    expect(screen.getByText(/Estimated at/)).toBeInTheDocument();
    expect(screen.getByText(/Comparable properties are asked at/)).toBeInTheDocument();
  });

  it('says which way the asking price differs, and by how much', async () => {
    stubApi({ valuation: valuation() });
    renderDetail();

    expect(
      await screen.findByText('This listing asks +13.6% above the estimate.'),
    ).toBeInTheDocument();
  });

  it('describes a price that matches the estimate without claiming a direction', async () => {
    stubApi({ valuation: valuation({ deviationPct: 0.4, verdict: 'FAIR' }) });
    renderDetail();

    expect(
      await screen.findByText('This listing asks about what the estimate says.'),
    ).toBeInTheDocument();
  });

  it('names the factors in the reader\u2019s language, not the model\u2019s column names', async () => {
    stubApi({ valuation: valuation() });
    renderDetail();

    expect(await screen.findByText('District')).toBeInTheDocument();
    expect(screen.getByText('Ground floor')).toBeInTheDocument();
    expect(screen.queryByText('district_slug')).not.toBeInTheDocument();
  });

  it('always carries the disclaimer and the model it came from', async () => {
    stubApi({ valuation: valuation() });
    renderDetail();

    expect(await screen.findByText(/It is not a valuation/)).toBeInTheDocument();
    expect(screen.getByText(/valuation-lgbm-20260914-65982e00/)).toBeInTheDocument();
  });

  it('says so when the listing has moved on since the estimate', async () => {
    stubApi({ valuation: valuation({ isStale: true }) });
    renderDetail();

    expect(await screen.findByText('Out of date')).toBeInTheDocument();
    expect(screen.getByText(/has not been recalculated/)).toBeInTheDocument();
  });

  it('is simply absent when no estimate can be had, leaving the listing intact', async () => {
    stubApi({});
    renderDetail();

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Price check' })).not.toBeInTheDocument();
    // The rest of the page is unaffected.
    expect(screen.getByText('Komitas 12')).toBeInTheDocument();
  });
});
