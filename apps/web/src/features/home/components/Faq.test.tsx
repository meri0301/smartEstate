import { QueryClientProvider } from '@tanstack/react-query';
import type { ModelAccuracy } from '@smartestate/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../../shared/api/query-client.js';
import { I18nProvider } from '../../../shared/i18n/I18nProvider.js';
import { Faq } from './Faq.js';

const accuracy: ModelAccuracy = {
  modelVersion: 'valuation-lgbm-20260914-65982e00',
  trainedAt: '2026-09-14T12:43:28+00:00',
  trainingRows: 300,
  districtsCovered: 12,
  target: 'log_price_per_sqm_amd',
  withinKnownDistrictsMape: 0.1283,
  unseenDistrictMape: 0.244,
  intervalCoverage: 0.8067,
};

const stub: { status: number } = { status: 200 };

beforeEach(() => {
  stub.status = 200;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = new URL((input as Request).url);
    if (url.pathname === '/api/valuation/model' && stub.status === 200) {
      return Promise.resolve(
        new Response(JSON.stringify(accuracy), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ statusCode: 503, error: 'x', message: 'no model' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderFaq(locale: 'en' | 'hy' | 'ru' = 'en') {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <I18nProvider locale={locale}>
        <Faq />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('Faq', () => {
  it('asks the five questions the design asks', async () => {
    renderFaq();

    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'How accurate is the AI?',
      'What data does it use?',
      'Is it free?',
      'How long does it take?',
      'Do I need an account?',
    ]);
  });

  it('opens the first answer and leaves the rest closed, as the design does', async () => {
    const { container } = render(
      <QueryClientProvider client={createQueryClient()}>
        <I18nProvider locale="en">
          <Faq />
        </I18nProvider>
      </QueryClientProvider>,
    );

    await screen.findAllByRole('heading', { level: 3 });
    const entries = [...container.querySelectorAll('details')];
    expect(entries).toHaveLength(5);
    expect(entries.map((entry) => entry.open)).toEqual([true, false, false, false, false]);
  });

  it('opens an answer on click', async () => {
    const { container } = render(
      <QueryClientProvider client={createQueryClient()}>
        <I18nProvider locale="en">
          <Faq />
        </I18nProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByText('Is it free?'));

    expect([...container.querySelectorAll('details')][2]?.open).toBe(true);
  });

  it('quotes the model’s own cross-validation rather than a figure typed here', async () => {
    // The mockup answers "within 5-10% of the final sale price". The real
    // errors are 12.8% and 24.4%, and they change whenever anything is
    // retrained, which is why they are fetched.
    renderFaq();

    expect(await screen.findByText(/12\.8%.*24\.4%/)).toBeInTheDocument();
    expect(screen.getByText(/valuation-lgbm-20260914-65982e00/)).toBeInTheDocument();
  });

  it('never claims anything about sale prices', async () => {
    // The catalogue holds asking prices and no record of what anyone paid, so
    // the one thing a reader most wants is the one thing it cannot say.
    renderFaq();

    expect(await screen.findByText(/not sale prices/)).toBeInTheDocument();
  });

  it('answers without numbers when the model cannot be reached', async () => {
    // A dead model service is not a broken page; the question still has an
    // answer, it just has no figures in it.
    stub.status = 503;
    renderFaq();

    expect(
      await screen.findByText(/that report is not reachable at the moment/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/12\.8%/)).not.toBeInTheDocument();
  });

  it('is translated, and does not fall back to English', async () => {
    renderFaq('hy');

    expect(await screen.findByText('Անվճա՞ր է')).toBeInTheDocument();
  });
});
