import { QueryClientProvider } from '@tanstack/react-query';
import type { District, RankedListing, RecommendationResponse } from '@smartestate/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../shared/api/query-client.js';
import { routes } from '../router.js';

const SESSION_ID = '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e99';

const districts: District[] = [
  {
    id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e70',
    slug: 'gyumri',
    kind: 'TOWN',
    name: { hy: 'Գյումրի', ru: 'Гюмри', en: 'Gyumri' },
    city: 'Gyumri',
    marz: 'Shirak',
    centroid: { lat: 40.79, lon: 43.85 },
  },
] as District[];

const item = (id: string, rank: number, title: string): RankedListing => ({
  listing: {
    id,
    publicId: `L-${id.slice(-6).toUpperCase()}`,
    status: 'PUBLISHED',
    locale: 'en',
    title,
    priceAmd: 29_200_000,
    pricePerSqmAmd: 498_294,
    originalCurrency: 'AMD',
    originalPrice: null,
    priceNegotiable: false,
    rooms: 2,
    totalArea: 58.6,
    floor: 3,
    totalFloors: 5,
    buildingType: 'PANEL',
    condition: 'GOOD',
    district: { slug: 'gyumri', name: { hy: 'Գյումրի', ru: 'Гюмри', en: 'Gyumri' } },
    location: { lat: 40.79, lon: 43.85 },
    thumbnailUrl: null,
    publishedAt: '2026-09-01T00:00:00.000Z',
  },
  rank,
  score: 0.81,
  breakdown: [],
  explanation: {
    highlights: [
      {
        criterion: 'value',
        kind: 'strength',
        score: 0.95,
        fact: { key: 'priceVsEstimatePct', value: -35.7 },
      },
      {
        criterion: 'building',
        kind: 'tradeoff',
        score: 0.2,
        fact: { key: 'buildingAgeYears', value: 51 },
      },
    ],
  },
});

const response: RecommendationResponse = {
  sessionId: SESSION_ID,
  strategy: 'MCDA',
  method: 'TOPSIS',
  arm: 'B',
  candidateCount: 42,
  omittedCriteria: ['location'],
  explanationSource: 'no-provider',
  items: [
    item('018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e01', 1, 'Two rooms in Gyumri'),
    item('018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e02', 2, 'Another two rooms'),
  ],
  createdAt: '2026-09-15T00:00:00.000Z',
};

/** Every request the page made, so the outcome stream can be asserted on. */
const sent: { url: string; body: unknown; headers: Headers }[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubApi(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const body = request.method === 'POST' ? ((await request.json()) as unknown) : undefined;
    sent.push({ url: url.pathname, body, headers: request.headers });
    if (url.pathname === '/api/districts') {
      return json(districts);
    }
    if (url.pathname === '/api/recommendations') {
      return json(response);
    }
    if (url.pathname === '/api/interactions') {
      return json(
        { id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5eaa', recordedAt: '2026-09-15T00:00:00.000Z' },
        201,
      );
    }
    return json({}, 404);
  });
}

function renderPage() {
  const router = createMemoryRouter(routes, { initialEntries: ['/en/picks'] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const ask = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Show my picks' }));
  await screen.findAllByRole('group');
};

describe('PicksPage', () => {
  beforeEach(() => {
    sent.length = 0;
    stubApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the recommender under the experiment, with a subject', async () => {
    renderPage();
    await ask();

    const call = sent.find((entry) => entry.url === '/api/recommendations');
    expect(call?.body).toMatchObject({ experimentKey: 'ranking-method', limit: 10 });
    // No subject, no arm: the header is what lets the server be sticky.
    expect(call?.headers.get('x-anonymous-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps the same anonymous id across requests, so one browser is one subject', async () => {
    renderPage();
    await ask();
    await userEvent.click(screen.getByRole('button', { name: 'Show my picks' }));
    await waitFor(() => {
      expect(sent.filter((entry) => entry.url === '/api/recommendations')).toHaveLength(2);
    });

    const ids = sent
      .filter((entry) => entry.url === '/api/recommendations')
      .map((entry) => entry.headers.get('x-anonymous-id'));
    expect(ids[0]).toBe(ids[1]);
  });

  it('renders the computed reasons, with their figures in the reader’s locale', async () => {
    // ADR-0014's highlights, rendered at last.
    renderPage();
    await ask();

    const card = screen.getByRole('group', { name: 'Two rooms in Gyumri' });
    expect(
      within(card).getByText(/price against the estimate — -35\.7% against the estimate/),
    ).toBeInTheDocument();
    expect(within(card).getByText(/the building — 51 years old/)).toBeInTheDocument();
    expect(within(card).getByText('What to weigh against that')).toBeInTheDocument();
  });

  it('says which criteria could not be scored', async () => {
    renderPage();
    await ask();

    expect(screen.getByText(/could not be measured: location/)).toBeInTheDocument();
  });

  it('reports a save as an outcome for the session that showed the listing', async () => {
    renderPage();
    await ask();

    const card = screen.getByRole('group', { name: 'Two rooms in Gyumri' });
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(sent.some((entry) => entry.url === '/api/interactions')).toBe(true);
    });
    const recorded = sent.find((entry) => entry.url === '/api/interactions');
    expect(recorded?.body).toEqual({
      listingId: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e01',
      type: 'FAVORITE',
      sessionId: SESSION_ID,
    });
    expect(within(card).getByRole('button', { name: 'Saved' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('reports a dismissal too, and hides the card', async () => {
    // The clearest verdict a reader gives, and the one most interfaces throw away.
    renderPage();
    await ask();

    const card = screen.getByRole('group', { name: 'Another two rooms' });
    await userEvent.click(within(card).getByRole('button', { name: 'Not for me' }));

    await waitFor(() => {
      expect(
        sent.some(
          (entry) =>
            entry.url === '/api/interactions' &&
            (entry.body as { type: string }).type === 'DISMISS',
        ),
      ).toBe(true);
    });
    expect(screen.getByText(/Hidden · Another two rooms/)).toBeInTheDocument();
  });

  it('reports opening a listing as a view before navigating', async () => {
    renderPage();
    await ask();

    await userEvent.click(screen.getByRole('link', { name: 'Two rooms in Gyumri' }));

    await waitFor(() => {
      expect(
        sent.some(
          (entry) =>
            entry.url === '/api/interactions' && (entry.body as { type: string }).type === 'VIEW',
        ),
      ).toBe(true);
    });
  });
});
