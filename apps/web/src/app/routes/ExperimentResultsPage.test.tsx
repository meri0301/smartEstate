import { QueryClientProvider } from '@tanstack/react-query';
import type { Experiment, ExperimentArm, ExperimentResults } from '@smartestate/contracts';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../shared/api/query-client.js';
import { routes } from '../router.js';

const armA: ExperimentArm = { name: 'A', strategy: 'MCDA', method: 'WEIGHTED_SUM', weight: 1 };
const armB: ExperimentArm = { name: 'B', strategy: 'MCDA', method: 'TOPSIS', weight: 1 };

const experiment: Experiment = {
  key: 'ranking-method',
  name: 'Weighted sum against TOPSIS',
  description: 'Same criteria, different aggregation.',
  arms: [armA, armB],
  isActive: true,
  createdAt: '2026-09-15T00:00:00.000Z',
};

const gains = {
  CONTACT: 3,
  FAVORITE: 3,
  COMPARE: 2,
  DWELL: 1,
  VIEW: 1,
  UNFAVORITE: 0,
  DISMISS: 0,
} as const;

const insufficient: ExperimentResults = {
  experiment,
  k: 10,
  relevanceGains: gains,
  minimumSessionsPerArm: 30,
  arms: [
    {
      arm: armA,
      sessions: 1,
      sessionsWithFeedback: 1,
      clickThroughRate: { mean: 1, standardError: 0, n: 1 },
      precisionAtK: { mean: 0.1, standardError: 0, n: 1 },
      ndcgAtK: { mean: 1, standardError: 0, n: 1 },
    },
    {
      arm: armB,
      sessions: 0,
      sessionsWithFeedback: 0,
      clickThroughRate: { mean: 0, n: 0 },
      precisionAtK: { mean: 0, n: 0 },
      ndcgAtK: { mean: 0, n: 0 },
    },
  ],
  comparisons: [],
  sufficient: false,
  computedAt: '2026-09-15T12:00:00.000Z',
};

const sufficient: ExperimentResults = {
  ...insufficient,
  arms: [
    {
      arm: armA,
      sessions: 60,
      sessionsWithFeedback: 40,
      clickThroughRate: { mean: 0.66, standardError: 0.06, n: 60 },
      precisionAtK: { mean: 0.22, standardError: 0.03, n: 40 },
      ndcgAtK: { mean: 0.71, standardError: 0.04, n: 40 },
    },
    {
      arm: armB,
      sessions: 58,
      sessionsWithFeedback: 30,
      clickThroughRate: { mean: 0.52, standardError: 0.065, n: 58 },
      precisionAtK: { mean: 0.19, standardError: 0.03, n: 30 },
      ndcgAtK: { mean: 0.6, standardError: 0.05, n: 30 },
    },
  ],
  comparisons: [
    {
      metric: 'clickThroughRate',
      arms: ['A', 'B'],
      difference: 0.14,
      confidenceLow: -0.03,
      confidenceHigh: 0.31,
      distinguishable: false,
    },
    {
      metric: 'ndcgAtK',
      arms: ['A', 'B'],
      difference: 0.11,
      confidenceLow: 0.02,
      confidenceHigh: 0.2,
      distinguishable: true,
    },
  ],
  sufficient: true,
};

const stub: { results: ExperimentResults; status: number } = { results: insufficient, status: 200 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubApi(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = new URL((input as Request).url);
    if (url.pathname === '/api/experiments') {
      return Promise.resolve(json([experiment]));
    }
    if (url.pathname.endsWith('/results')) {
      return Promise.resolve(
        stub.status === 200
          ? json(stub.results)
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

describe('ExperimentResultsPage', () => {
  beforeEach(() => {
    stub.results = insufficient;
    stub.status = 200;
    stubApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the experiments and links to each', async () => {
    renderAt('/en/experiments');

    const link = await screen.findByRole('link', { name: 'Weighted sum against TOPSIS' });
    expect(link).toHaveAttribute('href', '/en/experiments/ranking-method');
    expect(screen.getByText('A: WEIGHTED_SUM · B: TOPSIS')).toBeInTheDocument();
  });

  it('shows every mean with its error and sample size, never bare', async () => {
    // A mean without its error is the most common way a results page lies.
    renderAt('/en/experiments/ranking-method');

    const armA = await screen.findByRole('row', { name: /Arm A/ });
    expect(within(armA).getAllByText(/± 0 s\.e\./)).toHaveLength(3);
    expect(within(armA).getAllByText('n = 1')).toHaveLength(3);
  });

  it('says "no data" for an arm nobody has been served, not zero', async () => {
    // A zero is a measurement and an absence is not.
    renderAt('/en/experiments/ranking-method');

    const armB = await screen.findByRole('row', { name: /Arm B/ });
    expect(within(armB).getAllByText('no data')).toHaveLength(3);
    expect(within(armB).queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it('refuses to compare below the minimum, and says what the minimum is', async () => {
    renderAt('/en/experiments/ranking-method');

    expect(
      await screen.findByText(
        /Each arm needs at least 30 sessions; below that a difference is a story/,
      ),
    ).toBeInTheDocument();
  });

  it('shows the comparisons once there is enough data, with their intervals', async () => {
    stub.results = sufficient;
    renderAt('/en/experiments/ranking-method');

    expect(await screen.findByText('A − B on NDCG@10')).toBeInTheDocument();
    expect(screen.getByText('+0.11 (95% CI +0.02 to +0.2)')).toBeInTheDocument();
    expect(screen.getByText('The interval excludes zero.')).toBeInTheDocument();
  });

  it('does not claim a difference whose interval includes zero', async () => {
    stub.results = sufficient;
    renderAt('/en/experiments/ranking-method');

    await screen.findByText('A − B on Click-through rate');
    expect(
      screen.getByText('The interval includes zero: no difference can be claimed.'),
    ).toBeInTheDocument();
  });

  it('publishes how feedback was graded', async () => {
    renderAt('/en/experiments/ranking-method');

    expect(await screen.findByText('Saved — 3')).toBeInTheDocument();
    expect(screen.getByText('Dismissed — 0')).toBeInTheDocument();
  });

  it('reports a failure rather than an empty table', async () => {
    stub.status = 404;
    renderAt('/en/experiments/ranking-method');

    expect(await screen.findByText(/results could not be loaded/)).toBeInTheDocument();
  });
});
