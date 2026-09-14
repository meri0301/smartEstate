import { QueryClientProvider } from '@tanstack/react-query';
import type { ListingsPage } from '@smartestate/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../../shared/api/query-client.js';
import { flattenListings, useListingsSearch } from './use-listings.js';

const summary = (id: string, publicId: string): ListingsPage['items'][number] => ({
  id,
  publicId,
  status: 'PUBLISHED',
  locale: 'hy',
  title: 'Բնակարան',
  priceAmd: 45_000_000,
  pricePerSqmAmd: 625_000,
  originalCurrency: 'AMD',
  originalPrice: null,
  priceNegotiable: false,
  rooms: 3,
  totalArea: 72,
  floor: 4,
  totalFloors: 9,
  buildingType: 'STONE',
  condition: 'GOOD',
  district: { slug: 'arabkir', name: { hy: 'Արաբկիր', ru: 'Арабкир', en: 'Arabkir' } },
  location: { lat: 40.2, lon: 44.5 },
  thumbnailUrl: null,
  publishedAt: '2026-09-01T00:00:00.000Z',
});

describe('useListingsSearch', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  it('requests the first page with the filters and follows the cursor', async () => {
    const page1: ListingsPage = {
      items: [summary('1'.repeat(8), 'L-AAAAAA')],
      nextCursor: 'cursor-1',
    };
    const page2: ListingsPage = { items: [summary('2'.repeat(8), 'L-BBBBBB')], nextCursor: null };
    fetchSpy.mockImplementation((input) => {
      const url = new URL((input as Request).url);
      const body = url.searchParams.get('cursor') === 'cursor-1' ? page2 : page1;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const queryClient = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useListingsSearch({ districts: ['arabkir'], roomsMin: 2, limit: 1 }),
      {
        wrapper,
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    const firstUrl = new URL((fetchSpy.mock.calls[0]?.[0] as Request).url);
    expect(firstUrl.pathname).toBe('/api/listings');
    expect(firstUrl.searchParams.get('districts')).toBe('arabkir');
    expect(firstUrl.searchParams.get('roomsMin')).toBe('2');
    expect(firstUrl.searchParams.has('cursor')).toBe(false);
    expect(result.current.hasNextPage).toBe(true);

    await result.current.fetchNextPage();
    await waitFor(() => {
      expect(result.current.data?.pages).toHaveLength(2);
    });
    expect(result.current.hasNextPage).toBe(false);
    expect(flattenListings(result.current.data).map((item) => item.publicId)).toEqual([
      'L-AAAAAA',
      'L-BBBBBB',
    ]);
  });
});
