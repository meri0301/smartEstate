import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../shared/i18n/I18nProvider.js';
import { catalogueFor } from '../../../shared/i18n/catalogue.js';
import { LOCALES } from '../../../shared/i18n/locales.js';
import { WhySmartEstate } from './WhySmartEstate.js';

function renderAt(locale: 'en' | 'hy' | 'ru') {
  render(
    <I18nProvider locale={locale}>
      <WhySmartEstate />
    </I18nProvider>,
  );
}

describe('WhySmartEstate', () => {
  it('is a labelled region with the four reasons as a list', () => {
    renderAt('en');

    const section = screen.getByRole('region', { name: 'Why SmartEstate' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(4);
  });

  it('names the reasons in the order the design gives them', () => {
    renderAt('en');

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Market-wide comparison',
      'AI-powered accuracy',
      'Risk assessment',
      'Investment insights',
    ]);
  });

  it('hides the decorative icons from assistive technology', () => {
    // Each sits beside a heading that already names it; announcing "chart"
    // before "Market-wide comparison" is noise rather than information.
    const { container } = render(
      <I18nProvider locale="en">
        <WhySmartEstate />
      </I18nProvider>,
    );

    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(4);
    for (const icon of icons) {
      expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('claims nothing the build cannot do', () => {
    // The mockup promises real-time data, recent sales and capital
    // appreciation. The catalogue is seeded, holds asking prices only, and no
    // part of the system forecasts growth. A claim a reader can disprove by
    // using the product costs more than it buys, so this guards the copy.
    renderAt('en');

    const section = screen.getByRole('region', { name: 'Why SmartEstate' });
    const prose = section.textContent;
    for (const claim of [
      'real-time',
      'recent sales',
      'thousands of data points',
      'volatility',
      'capital appreciation',
      'long-term growth',
    ]) {
      expect(prose.toLowerCase()).not.toContain(claim);
    }
  });

  it('is translated in every language, with nothing falling back to a key', () => {
    for (const locale of LOCALES) {
      const catalogue = catalogueFor(locale);
      for (const key of [
        'home:why.title',
        'home:why.intro',
        'home:why.comparison.title',
        'home:why.comparison.body',
        'home:why.model.title',
        'home:why.model.body',
        'home:why.risk.title',
        'home:why.risk.body',
        'home:why.investment.title',
        'home:why.investment.body',
      ]) {
        expect(catalogue.get(key), `${locale} ${key}`).toBeTruthy();
      }
    }
  });

  it('renders the Armenian copy, not the English', () => {
    renderAt('hy');

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Ինչու SmartEstate');
  });
});
