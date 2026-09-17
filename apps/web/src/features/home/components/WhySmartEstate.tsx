import type { JSX, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Heading, Text } from '../../../shared/ui/index.js';

export const WHY_ID = 'why-smartestate';

const HEADING_ID = 'why-smartestate-heading';

/**
 * The icons from the design's lime chips.
 *
 * Written out rather than exported from Figma: these are four geometric glyphs
 * on a 24-unit grid, and inline SVG draws them in the chip's own ink at any
 * size, which a raster export of a 32px icon cannot. They are `aria-hidden`
 * because each sits beside the heading that already names it — announcing
 * "chart" before "Market-wide comparison" is noise, not information.
 */
const ICONS: Record<string, ReactNode> = {
  comparison: (
    <>
      <path d="M3 20h18" />
      <path d="M6 20v-6M12 20V6M18 20v-9" />
    </>
  ),
  model: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2.5V4.5M15 2.5V4.5M9 19.5v2M15 19.5v2M2.5 9h2M2.5 15h2M19.5 9h2M19.5 15h2" />
    </>
  ),
  risk: <path d="M12 3l7.5 3v5.2c0 4.6-3.1 8.4-7.5 10.3-4.4-1.9-7.5-5.7-7.5-10.3V6L12 3z" />,
  investment: (
    <>
      <path d="M3 16.5l5.5-5.5 3.5 3.5L21 6" />
      <path d="M15.5 6H21v5.5" />
    </>
  ),
};

/** The four cards, in the design's order. */
const REASONS = ['comparison', 'model', 'risk', 'investment'] as const;

/**
 * Why the product is worth believing.
 *
 * The mockup's copy claims real-time market data, recent sales, thousands of
 * data points, market volatility and capital appreciation. This build has none
 * of them: the catalogue is seeded rather than scraped, it holds asking prices
 * and no sales at all, and the model is trained on a few hundred rows. The
 * headings are the design's; the sentences under them describe what the system
 * actually does, because a claim a reader can disprove by using the product
 * costs more than it buys.
 */
export function WhySmartEstate(): JSX.Element {
  const { t } = useTranslation('home');

  return (
    <section id={WHY_ID} aria-labelledby={HEADING_ID} className="mt-16 scroll-mt-8 md:mt-20">
      <div className="flex max-w-2xl flex-col gap-2">
        <Heading as="h2" size="md" id={HEADING_ID}>
          {t('why.title')}
        </Heading>
        <Text tone="muted">{t('why.intro')}</Text>
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-4">
        {REASONS.map((reason) => (
          <Card as="li" key={reason} tone="muted" padding="lg" className="flex flex-col gap-4">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-full bg-accent text-on-accent"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
              >
                {ICONS[reason]}
              </svg>
            </span>
            <Heading as="h3" size="sm">
              {t(`why.${reason}.title`)}
            </Heading>
            <Text size="sm">{t(`why.${reason}.body`)}</Text>
          </Card>
        ))}
      </ul>
    </section>
  );
}
