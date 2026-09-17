import type { JSX } from 'react';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../shared/i18n/I18nProvider.js';
import { CallToAction } from './CallToAction.js';
import { LandingFooter } from './LandingFooter.js';

function renderAt(element: JSX.Element, locale: 'en' | 'hy' | 'ru' = 'en') {
  const router = createMemoryRouter(
    [{ path: '/:locale/*', element: <I18nProvider locale={locale}>{element}</I18nProvider> }],
    { initialEntries: [`/${locale}`] },
  );
  render(<RouterProvider router={router} />);
}

describe('CallToAction', () => {
  it('sends the reader to the calculator', () => {
    renderAt(<CallToAction />);

    expect(screen.getByRole('link', { name: 'Start Valuation' })).toHaveAttribute(
      'href',
      '#valuation',
    );
  });

  it('does not imply a charge that does not exist', () => {
    // The design says "No credit card required to start", which is true and
    // misleading at once: no card is required after starting either, because
    // there is no payment anywhere in the product.
    renderAt(<CallToAction />);

    const band = screen.getByRole('region', { name: /Ready to see your property/ });
    expect(band.textContent.toLowerCase()).not.toContain('credit card');
    expect(band).toHaveTextContent('there is nothing to buy');
  });
});

describe('LandingFooter', () => {
  it('is a landmark with a named link column', () => {
    renderAt(<LandingFooter />);

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('navigation', { name: 'Product' })).toBeInTheDocument();
  });

  it('links only to places that exist, and never to pricing', () => {
    // There is no payment surface in the product and no route that could serve
    // a pricing page, so the design's "Pricing" entry cannot be honoured.
    renderAt(<LandingFooter />);

    const footer = screen.getByRole('contentinfo');
    const hrefs = within(footer)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    expect(hrefs).toEqual([
      '/en',
      '#how-it-works',
      '#valuation',
      '#why-smartestate',
      '#faq',
      '/en/listings',
    ]);
    expect(within(footer).queryByText(/pricing/i)).not.toBeInTheDocument();
  });

  it('carries no social links, having no accounts to point them at', () => {
    renderAt(<LandingFooter />);

    const hrefs = within(screen.getByRole('contentinfo'))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '');
    for (const href of hrefs) {
      expect(href).not.toMatch(/twitter|x\.com|linkedin|instagram/i);
      expect(href).not.toBe('#');
    }
  });

  it('dates the copyright from the clock, not from a literal', () => {
    renderAt(<LandingFooter />);

    expect(
      screen.getByText(`© ${String(new Date().getFullYear())} SmartEstate`),
    ).toBeInTheDocument();
  });

  it('says what the project is and is not', () => {
    renderAt(<LandingFooter />);

    expect(
      screen.getByText(/university thesis project, not a commercial service/),
    ).toBeInTheDocument();
    expect(screen.getByText(/none of it is financial advice/)).toBeInTheDocument();
  });

  it('is translated', () => {
    renderAt(<LandingFooter />, 'ru');

    expect(screen.getByRole('navigation', { name: 'Продукт' })).toBeInTheDocument();
  });
});
