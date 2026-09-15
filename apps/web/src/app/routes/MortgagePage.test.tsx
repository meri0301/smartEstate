import { QueryClientProvider } from '@tanstack/react-query';
import type { District, MortgageRefund } from '@smartestate/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../shared/api/query-client.js';
import { routes } from '../router.js';

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
  {
    id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e71',
    slug: 'kentron',
    kind: 'CITY_DISTRICT',
    name: { hy: 'Կենտրոն', ru: 'Кентрон', en: 'Kentron' },
    city: 'Yerevan',
    marz: 'Yerevan',
    centroid: { lat: 40.18, lon: 44.51 },
  },
] as District[];

const eligible: MortgageRefund = {
  eligible: true,
  ineligibilityReasons: [],
  quarterlyRefund: 450_000,
  totalRefundOverTerm: 28_948_061,
  effectiveInterestRate: 1.74,
  monthlyPaymentAmd: 231_210,
  totalInterestAmd: 33_090_449,
  schedule: [
    { year: 1, interestAmd: 2_447_856, refundAmd: 1_800_000, cappedInAnyQuarter: true },
    { year: 2, interestAmd: 2_410_054, refundAmd: 1_800_000, cappedInAnyQuarter: false },
  ],
  ruleSetVersion: 2,
  calculatedAt: '2026-09-15T00:00:00.000Z',
};

const ineligible: MortgageRefund = {
  ...eligible,
  eligible: false,
  quarterlyRefund: 0,
  totalRefundOverTerm: 0,
  effectiveInterestRate: 11,
  schedule: [],
  forgoneQuarterlyRefund: 450_000,
  ineligibilityReasons: [
    {
      code: 'PHASED_OUT',
      messageKey: 'mortgage:ineligible.phasedOut',
      params: { marz: 'YEREVAN', phaseOutDate: '2025-01-01' },
    },
    {
      code: 'PROPERTY_TOO_EXPENSIVE',
      messageKey: 'mortgage:ineligible.propertyTooExpensive',
      params: { maxPropertyValueAmd: 55_000_000 },
    },
  ],
};

const stub: { refund: MortgageRefund; status: number } = { refund: eligible, status: 200 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubApi(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = new URL((input as Request).url);
    if (url.pathname === '/api/districts') {
      return Promise.resolve(json(districts));
    }
    if (url.pathname === '/api/mortgage/refund') {
      return Promise.resolve(
        stub.status === 200
          ? json(stub.refund)
          : json({ statusCode: stub.status, error: 'x', message: 'no' }, stub.status),
      );
    }
    return Promise.resolve(json({}, 404));
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

const calculate = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Work it out' }));
};

describe('MortgagePage', () => {
  beforeEach(() => {
    stub.refund = eligible;
    stub.status = 200;
    stubApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefills the price and the district from the address', async () => {
    renderAt('/en/mortgage?price=28000000&district=gyumri');

    expect(await screen.findByLabelText('Property price, AMD')).toHaveValue(28_000_000);
    expect(await screen.findByLabelText('Where the property is')).toHaveValue('gyumri');
  });

  it('expresses the refund as a lower rate, which is the sentence people repeat', async () => {
    renderAt('/en/mortgage');
    await calculate();

    expect(
      await screen.findByText('Your 11% mortgage behaves like a 1.74% one'),
    ).toBeInTheDocument();
  });

  it('states the assumption behind the total rather than leaving it to be worked out', async () => {
    renderAt('/en/mortgage');
    await calculate();

    expect(await screen.findByText(/keep paying this much income tax/)).toBeInTheDocument();
  });

  it('translates every reason, including the province inside it', async () => {
    // The server sends the province as an enum; "the scheme ended in YEREVAN"
    // would be a leak of the wire format into the page.
    stub.refund = ineligible;
    renderAt('/en/mortgage');
    await calculate();

    expect(
      await screen.findByText(/The scheme ended in Yerevan for agreements signed on or after/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/YEREVAN/)).not.toBeInTheDocument();
  });

  it('lists every failed condition, not the first', async () => {
    stub.refund = ineligible;
    renderAt('/en/mortgage');
    await calculate();

    expect(await screen.findByText(/worth more than the/)).toBeInTheDocument();
    expect(screen.getByText(/The scheme ended in Yerevan/)).toBeInTheDocument();
  });

  it('says what an ineligible buyer would have received', async () => {
    stub.refund = ineligible;
    renderAt('/en/mortgage');
    await calculate();

    expect(
      await screen.findByText(/it would have refunded up to ֏450,000 a quarter/),
    ).toBeInTheDocument();
  });

  it.each([
    ['eligible', eligible],
    ['ineligible', ineligible],
  ])('carries the disclaimer when %s', async (_label, refund) => {
    // Required whatever the verdict: this is money and tax, and the product is
    // not qualified to be believed about either.
    stub.refund = refund;
    renderAt('/en/mortgage');
    await calculate();

    expect(await screen.findByText(/not tax advice/)).toBeInTheDocument();
    expect(screen.getByText(/State Revenue Committee/)).toBeInTheDocument();
  });

  it('names the rule set that produced the answer', async () => {
    renderAt('/en/mortgage');
    await calculate();

    expect(await screen.findByText(/rule set 2, the one in force/)).toBeInTheDocument();
  });

  it('reports a failure rather than showing an empty result', async () => {
    stub.status = 503;
    renderAt('/en/mortgage');
    await calculate();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be completed/);
  });
});
