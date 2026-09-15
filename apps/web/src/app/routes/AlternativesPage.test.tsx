import { QueryClientProvider } from '@tanstack/react-query';
import type { AlternativeListing } from '@smartestate/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../shared/api/query-client.js';
import { routes } from '../router.js';

const SUBJECT_ID = '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e00';

const summary = (id: string, title: string, priceAmd: number) => ({
  id,
  publicId: `L-${id.slice(-6).toUpperCase()}`,
  status: 'PUBLISHED' as const,
  locale: 'en' as const,
  title,
  priceAmd,
  pricePerSqmAmd: Math.round(priceAmd / 60),
  originalCurrency: 'AMD' as const,
  originalPrice: null,
  priceNegotiable: false,
  rooms: 2,
  totalArea: 60,
  floor: 4,
  totalFloors: 9,
  buildingType: 'STONE' as const,
  condition: 'GOOD' as const,
  district: { slug: 'kentron', name: { hy: 'Կենտրոն', ru: 'Кентрон', en: 'Kentron' } },
  location: { lat: 40.18, lon: 44.51 },
  thumbnailUrl: null,
  publishedAt: '2026-09-01T00:00:00.000Z',
});

const subject = summary(SUBJECT_ID, 'The flat being viewed', 69_000_000);

const comparison = (
  criterion: string,
  direction: 'better' | 'worse' | 'same',
  subjectValue: number,
  alternativeValue: number,
  unit: string,
) => ({ criterion, direction, subject: subjectValue, alternative: alternativeValue, unit });

const dominant: AlternativeListing = {
  listing: summary('018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e01', 'Strictly better flat', 67_000_000),
  relation: 'DOMINATES',
  comparisons: [
    comparison('price', 'better', 69_000_000, 67_000_000, 'amd'),
    comparison('area', 'same', 60, 60, 'sqm'),
  ],
  betterCount: 1,
  worseCount: 0,
} as AlternativeListing;

const tradeOff: AlternativeListing = {
  listing: summary('018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e02', 'Cheaper but smaller flat', 62_000_000),
  relation: 'TRADE_OFF',
  comparisons: [
    comparison('price', 'better', 69_000_000, 62_000_000, 'amd'),
    comparison('area', 'worse', 60, 48, 'sqm'),
  ],
  betterCount: 1,
  worseCount: 1,
} as AlternativeListing;

const stub: { alternatives: AlternativeListing[]; omitted: string[]; status: number } = {
  alternatives: [],
  omitted: [],
  status: 200,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubApi(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = new URL((input as Request).url);
    if (url.pathname.endsWith('/alternatives')) {
      if (stub.status !== 200) {
        return Promise.resolve(
          json({ statusCode: stub.status, error: 'x', message: 'nope' }, stub.status),
        );
      }
      return Promise.resolve(
        json({
          subject,
          criteria: ['price', 'area'],
          omittedCriteria: stub.omitted,
          candidateCount: 17,
          alternatives: stub.alternatives,
        }),
      );
    }
    if (url.pathname.startsWith('/api/listings/')) {
      return Promise.resolve(
        json({ ...subject, description: '', media: [], priceHistory: [], building: null }),
      );
    }
    if (url.pathname === '/api/districts') {
      return Promise.resolve(json([]));
    }
    return Promise.resolve(json({}, 404));
  });
}

function renderPage() {
  const router = createMemoryRouter(routes, {
    initialEntries: [`/en/listings/${subject.publicId}/alternatives`],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('AlternativesPage', () => {
  beforeEach(() => {
    stub.alternatives = [dominant, tradeOff];
    stub.omitted = [];
    stub.status = 200;
    stubApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leads with the answer when something is strictly better', async () => {
    renderPage();

    expect(await screen.findByText(/better than this one in every respect/)).toBeInTheDocument();
  });

  it('says plainly when nothing is better, rather than showing an empty list', async () => {
    stub.alternatives = [];
    renderPage();

    expect(
      await screen.findByText(/Nothing among the comparable listings is better/),
    ).toBeInTheDocument();
  });

  it('says that nothing is strictly better when there are only trade-offs', async () => {
    stub.alternatives = [tradeOff];
    renderPage();

    expect(await screen.findByText(/Nothing is better in every respect/)).toBeInTheDocument();
  });

  it('shows what a trade-off costs as prominently as what it offers', async () => {
    renderPage();
    const card = await screen.findByRole('group', { name: 'Cheaper but smaller flat' });

    // Not behind a "show more": a trade-off a reader has to expand is one the
    // page is hoping they will not read.
    expect(within(card).getByText(/Worse on 1 thing/)).toBeInTheDocument();
    expect(within(card).getByText(/Better on 1 thing/)).toBeInTheDocument();
  });

  it('marks the best value in each row of the table', async () => {
    renderPage();
    await screen.findAllByText('Strictly better flat');

    const priceRow = screen.getByRole('row', { name: /Price/ });
    const best = within(priceRow).getAllByText(/\(best\)/);
    expect(best).toHaveLength(1);
  });

  it('names the criteria it could not measure', async () => {
    stub.omitted = ['location'];
    renderPage();

    expect(await screen.findByText(/could not be measured: Distance/)).toBeInTheDocument();
  });

  it('removes a listing from the table when its button says it will', async () => {
    // The table seeds itself with the strongest options, so the first click on
    // one of them has to remove it rather than add it again.
    renderPage();
    await screen.findAllByText('Strictly better flat');

    const columnsBefore = screen.getAllByRole('columnheader').length;
    const [firstButton] = screen.getAllByRole('button', { name: 'Remove from the table' });
    expect(firstButton).toBeDefined();
    await userEvent.click(firstButton as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getAllByRole('columnheader').length).toBe(columnsBefore - 1);
    });
  });

  it('reports a failure instead of rendering an empty comparison', async () => {
    stub.status = 503;
    renderPage();

    expect(await screen.findByText(/comparison could not be loaded/)).toBeInTheDocument();
  });

  it('links back to the listing being compared', async () => {
    renderPage();

    const back = await screen.findByRole('link', { name: /Back to The flat being viewed/ });
    expect(back).toHaveAttribute('href', `/en/listings/${subject.publicId}`);
  });
});
