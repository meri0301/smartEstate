import { QueryClientProvider } from '@tanstack/react-query';
import type { ProductStats, Review, ReviewList } from '@smartestate/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../../shared/api/query-client.js';
import { I18nProvider } from '../../../shared/i18n/I18nProvider.js';
import { ReviewsSection } from './ReviewsSection.js';

const review = (id: string, overrides: Partial<Review> = {}): Review => ({
  id,
  authorName: 'Anahit S.',
  authorRole: 'HOMEBUYER',
  body: 'The evidence count told me the estimate was thin for my district, which was more useful than the number.',
  locale: 'en',
  createdAt: '2026-09-17T09:00:00.000Z',
  ...overrides,
});

const stats: ProductStats = { valuationsCompleted: 12, listingsPublished: 340 };

const state: { list: ReviewList; createStatus: number } = {
  list: { items: [], total: 0 },
  createStatus: 200,
};

/** Every request the section made, so the payload can be asserted on. */
const sent: { url: string; method: string; body: unknown }[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  sent.length = 0;
  state.list = { items: [], total: 0 };
  state.createStatus = 200;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const body = request.method === 'POST' ? ((await request.json()) as unknown) : undefined;
    sent.push({ url: url.pathname, method: request.method, body });

    if (url.pathname === '/api/reviews/stats') {
      return json(stats);
    }
    if (url.pathname === '/api/reviews' && request.method === 'POST') {
      return state.createStatus === 200
        ? json(review('018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5eff'))
        : json({ statusCode: 429, error: 'x', message: 'slow down' }, state.createStatus);
    }
    if (url.pathname === '/api/reviews') {
      return json(state.list);
    }
    return json({}, 404);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSection(locale: 'en' | 'hy' | 'ru' = 'en') {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <I18nProvider locale={locale}>
        <ReviewsSection />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('ReviewsSection', () => {
  it('says there are none rather than inventing some', async () => {
    // The design fills this with three quotations from people who do not
    // exist. An empty state is the only honest thing to show instead.
    renderSection();

    expect(await screen.findByText(/No reviews yet/)).toBeInTheDocument();
  });

  it('says plainly that names are not verified', async () => {
    // Anyone may write one under any name, so the page must not imply that
    // these are confirmed identities.
    renderSection();

    expect(await screen.findByText(/are not verified by us/)).toBeInTheDocument();
  });

  it('shows the reviews as a scrollable list, all of them in the document', async () => {
    // A rotating banner would hide most of the content from everything except
    // a mouse. Every review is reachable here.
    state.list = {
      items: [
        review('018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e01'),
        review('018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e02'),
        review('018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e03'),
      ],
      total: 3,
    };
    renderSection();

    const carousel = await screen.findByRole('list', { name: 'Reviews' });
    expect(within(carousel).getAllByRole('listitem')).toHaveLength(3);
    expect(carousel).toHaveAttribute('tabindex', '0');
  });

  it('marks the language a review was written in', async () => {
    // A review is prose and cannot be machine translated without putting words
    // in its author's mouth, so the quote carries its own language instead.
    state.list = {
      items: [
        review('018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e01', {
          locale: 'hy',
          body: 'Շատ օգտակար գործիք է գնահատման համար։',
        }),
      ],
      total: 1,
    };
    const { container } = render(
      <QueryClientProvider client={createQueryClient()}>
        <I18nProvider locale="en">
          <ReviewsSection />
        </I18nProvider>
      </QueryClientProvider>,
    );

    await screen.findByRole('list', { name: 'Reviews' });
    expect(container.querySelector('[lang="hy"]')).not.toBeNull();
  });

  it('warns what publishing means before anything is typed', async () => {
    renderSection();

    await userEvent.click(await screen.findByRole('button', { name: 'Write a review' }));

    expect(screen.getByText(/published publicly under the name you type/)).toBeInTheDocument();
    expect(screen.getByText(/appears on this page straight away/)).toBeInTheDocument();
  });

  it('sends the page’s language with the review, without asking for it', async () => {
    // It is not a choice: it is the language they are already writing in.
    renderSection('ru');

    await userEvent.click(await screen.findByRole('button', { name: 'Написать отзыв' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Ваше имя/ }), 'Ани');
    await userEvent.type(
      screen.getByRole('textbox', { name: /Ваш отзыв/ }),
      'Очень полезный инструмент для оценки квартиры перед покупкой.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Опубликовать отзыв' }));

    await waitFor(() => {
      expect(sent.some((entry) => entry.method === 'POST')).toBe(true);
    });
    const call = sent.find((entry) => entry.method === 'POST');
    expect(call?.body).toMatchObject({ authorName: 'Ани', authorRole: 'HOMEBUYER', locale: 'ru' });
  });

  it('confirms publication and closes the form', async () => {
    renderSection();

    await userEvent.click(await screen.findByRole('button', { name: 'Write a review' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Your name/ }), 'Anahit');
    await userEvent.type(
      screen.getByRole('textbox', { name: /Your review/ }),
      'It told me the estimate rested on thin data, which was the useful part.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Publish my review' }));

    expect(await screen.findByRole('status')).toHaveTextContent('your review is on the page');
    expect(screen.queryByRole('button', { name: 'Publish my review' })).not.toBeInTheDocument();
  });

  it('names the rate limit rather than failing vaguely, and keeps what was written', async () => {
    // The budget is keyed on the address, which a dev proxy and an office
    // connection both share, so this is the likeliest refusal by far. Losing
    // the text to it would be the rudest possible way to report one.
    state.createStatus = 429;
    renderSection();

    await userEvent.click(await screen.findByRole('button', { name: 'Write a review' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Your name/ }), 'Anahit');
    const body = screen.getByRole('textbox', { name: /Your review/ });
    await userEvent.type(body, 'It told me the estimate rested on thin data, which helped a lot.');
    await userEvent.click(screen.getByRole('button', { name: 'Publish my review' }));

    expect(
      await screen.findByText('You have published a few reviews already. Please try again later.'),
    ).toBeInTheDocument();
    expect(body).toHaveValue('It told me the estimate rested on thin data, which helped a lot.');
  });

  it('states counts that can be checked, not a round number', async () => {
    renderSection();

    expect(await screen.findByText('340 apartments in the catalogue')).toBeInTheDocument();
    expect(screen.getByText('12 valuations completed')).toBeInTheDocument();
  });
});
