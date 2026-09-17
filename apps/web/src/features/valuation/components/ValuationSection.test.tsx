import { QueryClientProvider } from '@tanstack/react-query';
import type { District, ValuationQuote } from '@smartestate/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../../shared/api/query-client.js';
import { I18nProvider } from '../../../shared/i18n/I18nProvider.js';
import { ValuationSection } from './ValuationSection.js';

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
] as District[];

const quote: ValuationQuote = {
  modelVersion: 'valuation-lgbm-20260914-65982e00',
  fairPriceAmd: 56_678_666,
  lowerBoundAmd: 40_528_951,
  upperBoundAmd: 64_417_112,
  deviationPct: 1.65,
  verdict: 'FAIR',
  factors: [{ feature: 'district_slug', value: 'arabkir', effect: 0.32, impactAmd: 14_000_000 }],
  comparableCount: 15,
  evidence: 'MODERATE',
  confidence: 0.579,
  grossRentalYieldPct: 6.32,
  assumptions: [
    { field: 'coordinates', value: 'arabkir' },
    { field: 'interior', value: 'arabkir' },
  ],
  calculatedAt: '2026-09-17T09:00:00.000Z',
};

/** Every request the section made, so the payload can be asserted on. */
const sent: { url: string; body: unknown }[] = [];
const stub: { status: number } = { status: 200 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  sent.length = 0;
  stub.status = 200;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const body = request.method === 'POST' ? ((await request.json()) as unknown) : undefined;
    sent.push({ url: url.pathname, body });
    if (url.pathname === '/api/districts') {
      return json(districts);
    }
    if (url.pathname === '/api/valuation/quote') {
      return stub.status === 200
        ? json(quote)
        : json({ statusCode: stub.status, error: 'x', message: 'no model' }, stub.status);
    }
    return json({}, 404);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSection() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <I18nProvider locale="en">
        <ValuationSection />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

/** Fills the form from the example and asks for a verdict. */
async function askForAVerdict(): Promise<void> {
  await screen.findByRole('option', { name: 'Arabkir' });
  await userEvent.click(screen.getByRole('button', { name: 'Try an example' }));
  await userEvent.click(screen.getByRole('button', { name: 'Get my verdict' }));
}

describe('ValuationSection', () => {
  it('holds the verdict panel’s place before there is a verdict', async () => {
    // A panel that appears and shifts the page down as the answer arrives is
    // harder to read than one that was always there.
    renderSection();

    expect(
      await screen.findByText('Fill in the details and the verdict appears here.'),
    ).toBeInTheDocument();
  });

  it('sends what the reader filled in, and omits what they did not', async () => {
    renderSection();
    await askForAVerdict();

    await waitFor(() => {
      expect(sent.some((entry) => entry.url === '/api/valuation/quote')).toBe(true);
    });
    const call = sent.find((entry) => entry.url === '/api/valuation/quote');
    expect(call?.body).toMatchObject({
      districtSlug: 'arabkir',
      rooms: 2,
      totalArea: 63,
      askingPriceAmd: 57_000_000,
      constructionYear: 1961,
      heating: 'ELECTRIC',
    });
    expect(call?.body).not.toHaveProperty('notes');
  });

  it('shows the estimate as a range, never as a single number', async () => {
    // Collapsing the model's interval to a point is the most misleading thing
    // this panel could do.
    renderSection();
    await askForAVerdict();

    expect(await screen.findByText(/֏40,528,951\s*–\s*֏64,417,112/)).toBeInTheDocument();
  });

  it('says where the asking price sits, in words', async () => {
    renderSection();
    await askForAVerdict();

    expect(
      await screen.findByText(/About 1.7% above comparable listings nearby/),
    ).toBeInTheDocument();
  });

  it('reports the evidence behind the figure with its count', async () => {
    renderSection();
    await askForAVerdict();

    expect(await screen.findByText('Evidence — some comparable data')).toBeInTheDocument();
    expect(screen.getByText(/15 comparable listings in this district/)).toBeInTheDocument();
  });

  it('announces both meters with their value, not just a coloured bar', async () => {
    renderSection();
    await askForAVerdict();

    const meters = await screen.findAllByRole('meter');
    expect(meters).toHaveLength(2);
    expect(meters[1]).toHaveAttribute('aria-valuenow', '58');
  });

  it('refuses to call the confidence a probability', async () => {
    renderSection();
    await askForAVerdict();

    expect(await screen.findByText(/It is not a probability/)).toBeInTheDocument();
  });

  it('lists every substitution it made for a blank', async () => {
    // A reader who did not know a field should be able to see what was used.
    renderSection();
    await askForAVerdict();

    expect(await screen.findByText(/Placed at the centre of the district/)).toBeInTheDocument();
    expect(
      screen.getByText(/Ceiling height, room sizes and balconies taken from/),
    ).toBeInTheDocument();
  });

  it('shows the gross yield when a rent was given', async () => {
    renderSection();
    await askForAVerdict();

    expect(await screen.findByText('6.3% a year before costs')).toBeInTheDocument();
  });

  it('names the model that produced the figure', async () => {
    renderSection();
    await askForAVerdict();

    expect(await screen.findByText(/valuation-lgbm-20260914-65982e00/)).toBeInTheDocument();
  });

  it('reports a failure rather than an empty panel', async () => {
    stub.status = 503;
    renderSection();
    await askForAVerdict();

    expect(await screen.findByText('The valuation could not be worked out.')).toBeInTheDocument();
  });

  it('clears the verdict when the reader starts again', async () => {
    renderSection();
    await askForAVerdict();

    const panel = await screen.findByText('Start a new valuation');
    await userEvent.click(panel);

    expect(
      await screen.findByText('Fill in the details and the verdict appears here.'),
    ).toBeInTheDocument();
  });

  it('tells the reader their notes do not reach the model', async () => {
    // The model reads numbers and categories, so prose has nowhere honest to
    // go. That it never becomes a feature is asserted server-side, in
    // quote.spec.ts; what matters here is that the form says so.
    renderSection();

    expect(
      await screen.findByText(/It is not sent to the model, which reads numbers and categories/),
    ).toBeInTheDocument();
  });
});
