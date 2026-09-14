import { QueryClientProvider } from '@tanstack/react-query';
import type { ListingDetail } from '@smartestate/contracts';
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

function stub(status: number, body: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
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
