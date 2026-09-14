import { QueryClientProvider } from '@tanstack/react-query';
import type { District, ListingsPage } from '@smartestate/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../shared/api/query-client.js';
import { routes } from '../router.js';

/**
 * The map is WebGL, which jsdom does not have, so the module is replaced by a
 * marker element. What the map does with its data is covered by the unit tests
 * in `features/map/model`; what matters here is that choosing the map view
 * hands it the listings that were found.
 */
vi.mock('../../features/map/index.js', () => ({
  ListingMap: ({ markers, label }: { markers: unknown[]; label: string }) => (
    <div data-testid="map" aria-label={label}>
      {markers.length}
    </div>
  ),
}));

const listing = (overrides: Partial<ListingsPage['items'][number]> = {}) => ({
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
  publicId: 'L-ABC234',
  status: 'PUBLISHED' as const,
  locale: 'en' as const,
  title: 'Bright three-room flat',
  priceAmd: 45_000_000,
  pricePerSqmAmd: 625_000,
  originalCurrency: 'AMD' as const,
  originalPrice: null,
  priceNegotiable: false,
  rooms: 3,
  totalArea: 72,
  floor: 4,
  totalFloors: 9,
  buildingType: 'STONE' as const,
  condition: 'GOOD' as const,
  district: { slug: 'arabkir', name: { hy: 'Արաբկիր', ru: 'Арабкир', en: 'Arabkir' } },
  location: { lat: 40.2, lon: 44.5 },
  thumbnailUrl: null,
  publishedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const districts: District[] = [
  {
    id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e70',
    slug: 'arabkir',
    kind: 'CITY_DISTRICT',
    name: { hy: 'Արաբկիր', ru: 'Арабкир', en: 'Arabkir' },
    city: 'Yerevan',
    marz: 'Yerevan',
    centroid: { lat: 40.2, lon: 44.5 },
  },
  {
    id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e71',
    slug: 'kentron',
    kind: 'CITY_DISTRICT',
    name: { hy: 'Կենտրոն', ru: 'Кентрон', en: 'Kentron' },
    city: 'Yerevan',
    marz: 'Yerevan',
    centroid: { lat: 40.18, lon: 44.51 },
  },
];

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** Every search request the page made, newest last. */
const searchUrls: URL[] = [];

function stubApi(page: ListingsPage): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = new URL((input as Request).url);
    if (url.pathname === '/api/districts') {
      return Promise.resolve(json(districts));
    }
    if (url.pathname === '/api/listings') {
      searchUrls.push(url);
      return Promise.resolve(json(page));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  searchUrls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('the search screen', () => {
  it('lists what the API returned, with the price, size and district of each', async () => {
    stubApi({ items: [listing()], nextCursor: null });
    renderAt('/en/listings');

    const card = await screen.findByRole('link', { name: /Bright three-room flat/ });
    expect(within(card).getByText('Arabkir')).toBeInTheDocument();
    expect(within(card).getByText('3 rooms · 72 m² · Floor 4 of 9')).toBeInTheDocument();
    expect(card).toHaveAttribute('href', '/en/listings/L-ABC234');
  });

  it('says so when nothing matched, rather than showing an empty grid', async () => {
    stubApi({ items: [], nextCursor: null });
    renderAt('/en/listings');

    expect(await screen.findByText('No listings match these filters')).toBeInTheDocument();
  });

  it('reads the filters out of the URL and sends them to the API', async () => {
    stubApi({ items: [listing()], nextCursor: null });
    renderAt('/en/listings?priceMax=50000000&districts=arabkir&hasElevator=true');

    await screen.findByRole('link', { name: /Bright three-room flat/ });
    const url = searchUrls.at(-1);
    expect(url?.searchParams.get('priceMax')).toBe('50000000');
    expect(url?.searchParams.get('districts')).toBe('arabkir');
    expect(url?.searchParams.get('hasElevator')).toBe('true');
    expect(url?.searchParams.get('locale')).toBe('en');
  });

  it('puts a filter chosen in the panel into the URL, so the search can be shared', async () => {
    stubApi({ items: [listing()], nextCursor: null });
    const router = renderAt('/en/listings');
    await screen.findByRole('link', { name: /Bright three-room flat/ });

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Kentron' }));

    await waitFor(() => {
      expect(router.state.location.search).toContain('districts=kentron');
    });
    await waitFor(() => {
      expect(searchUrls.at(-1)?.searchParams.get('districts')).toBe('kentron');
    });
  });

  it('changes the sort through the URL as well', async () => {
    stubApi({ items: [listing()], nextCursor: null });
    const router = renderAt('/en/listings');
    await screen.findByRole('link', { name: /Bright three-room flat/ });

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Sort by' }),
      'price_per_sqm_asc',
    );

    await waitFor(() => {
      expect(router.state.location.search).toContain('sort=price_per_sqm_asc');
    });
    expect(searchUrls.at(-1)?.searchParams.get('sort')).toBe('price_per_sqm_asc');
  });

  it('clears every filter but keeps the sort', async () => {
    stubApi({ items: [listing()], nextCursor: null });
    const router = renderAt('/en/listings?sort=price_asc&districts=arabkir&hasParking=true');
    await screen.findByRole('link', { name: /Bright three-room flat/ });

    await userEvent.click(screen.getByRole('button', { name: 'Clear 2 filters' }));

    await waitFor(() => {
      expect(router.state.location.search).toBe('?sort=price_asc');
    });
  });

  it('hands the map the listings it found when the reader switches view', async () => {
    stubApi({ items: [listing()], nextCursor: null });
    const router = renderAt('/en/listings');
    await screen.findByRole('link', { name: /Bright three-room flat/ });

    await userEvent.click(screen.getByRole('button', { name: 'Map' }));

    const map = await screen.findByTestId('map');
    expect(map).toHaveTextContent('1');
    expect(map).toHaveAttribute('aria-label', 'Map with 1 listing');
    // The view is part of the address, so the map can be linked to.
    expect(router.state.location.search).toContain('view=map');
  });

  it('offers more results only while the API says there are more', async () => {
    stubApi({ items: [listing()], nextCursor: 'next' });
    renderAt('/en/listings');
    await screen.findByRole('link', { name: /Bright three-room flat/ });
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  it('reports a failed search and offers to try again', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL((input as Request).url);
      if (url.pathname === '/api/districts') {
        return Promise.resolve(json(districts));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ statusCode: 400, error: 'Bad Request', message: 'Nope' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    renderAt('/en/listings');

    expect(await screen.findByText('The search could not be completed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
