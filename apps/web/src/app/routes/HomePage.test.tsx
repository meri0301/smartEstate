import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { createQueryClient } from '../../shared/api/query-client.js';
import { useSessionStore } from '../../shared/api/session-store.js';
import { routes } from '../router.js';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  window.localStorage.clear();
  useSessionStore.setState({ status: 'unknown', accessToken: null, user: null });
});

describe('HomePage', () => {
  it('leads with the question the product answers', async () => {
    renderAt('/en');

    const headline = await screen.findByRole('heading', { level: 1 });
    expect(headline).toHaveTextContent('Should you buy this house or not?');
    expect(headline).toHaveTextContent('Get an AI-powered valuation in seconds.');
  });

  it('wears the landing chrome, not the app chrome', async () => {
    // The app header carries a search link; the design's landing header does
    // not, and two headers on one page would be a bug rather than a style.
    renderAt('/en');

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Search' })).not.toBeInTheDocument();
  });

  it('keeps language and theme reachable from the first page a visitor sees', async () => {
    // Absent from the mockup, required by a trilingual product.
    renderAt('/en');

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('navigation', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
  });

  it('sends the hero to the calculator and the header into the app', async () => {
    // The design funnels a visitor towards valuing the property in front of
    // them; the catalogue has to stay reachable from somewhere, and that is
    // what the header's Start is for.
    renderAt('/en');

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute('href', '/en/listings');
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '#valuation');
  });

  it('links the nav only to sections that exist', async () => {
    renderAt('/en');
    await screen.findByRole('heading', { level: 1 });

    // Scoped to the header: the footer repeats these names by design, and an
    // unscoped lookup would match both.
    const nav = within(screen.getByRole('banner')).getByRole('navigation', { name: 'Landing' });
    expect(within(nav).getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '#how-it-works',
    );
    expect(within(nav).getByRole('link', { name: 'Valuation' })).toHaveAttribute(
      'href',
      '#valuation',
    );
    expect(within(nav).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq');
  });

  it('never points a link at a section that is not on the page', async () => {
    // Header and footer both anchor into this page, so one sweep covers both.
    renderAt('/en');
    await screen.findByRole('heading', { level: 1 });

    const anchors = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('#'));

    expect(anchors.length).toBeGreaterThan(0);
    for (const href of anchors) {
      expect(document.querySelector(href), href).not.toBeNull();
    }
  });

  it('names the three steps in the order they are performed', async () => {
    // The design puts the third card second from the left; document order has
    // to stay the order of the process, because that is what is read aloud.
    renderAt('/en');

    const section = await screen.findByRole('region', { name: 'How it works' });
    const steps = within(section).getAllByRole('heading', { level: 3 });
    expect(steps.map((step) => step.textContent)).toEqual([
      'Add the property details',
      'Let AI analyze the market',
      'Get a smart buying recommendation',
    ]);
  });

  it('jumps to the steps from the header', async () => {
    renderAt('/en');
    await screen.findByRole('heading', { level: 1 });

    const nav = within(screen.getByRole('banner')).getByRole('navigation', { name: 'Landing' });
    expect(within(nav).getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '#how-it-works',
    );
  });

  it('switches language without leaving the page', async () => {
    const router = renderAt('/en');

    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('link', { name: 'Switch to Русский' }));

    expect(router.state.location.pathname).toBe('/ru');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Как это работает' }),
    ).toBeInTheDocument();
  });
});
