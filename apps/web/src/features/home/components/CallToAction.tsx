import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { VALUATION_ID } from '../../valuation/index.js';
import { Heading, Text } from '../../../shared/ui/index.js';

const HEADING_ID = 'cta-heading';

/**
 * The closing band: one more route into the calculator, for a reader who has
 * come all the way down the page.
 *
 * The design's second line reads "No credit card required to start", which
 * would be true and misleading at once. There is no card required later
 * either — no payment surface exists anywhere in the product and none is
 * planned — and a sentence that only denies a charge *to start* implies one
 * after it. The line says what is actually the case instead.
 *
 * The button is dark on the lime band, which is the one place in the design
 * where the accent is the surface rather than the control.
 */
export function CallToAction(): JSX.Element {
  const { t } = useTranslation('home');

  return (
    <section
      aria-labelledby={HEADING_ID}
      className="mt-16 flex flex-col gap-6 rounded-md bg-accent p-8 md:mt-20 md:flex-row md:items-center md:justify-between md:gap-10 md:p-12"
    >
      <div className="flex max-w-2xl flex-col gap-3">
        <Heading as="h2" size="md" tone="onAccent" id={HEADING_ID}>
          {t('cta.title')}
        </Heading>
        <Text size="sm" tone="onAccent">
          {t('cta.body')}
        </Text>
      </div>

      <a
        href={`#${VALUATION_ID}`}
        className="inline-flex h-control-lg shrink-0 items-center justify-center self-start rounded-full bg-inverse px-8 font-body font-semibold text-on-inverse transition-opacity duration-[var(--se-duration-fast)] ease-standard hover:opacity-90 active:opacity-80 md:self-auto"
      >
        {t('cta.action')}
      </a>
    </section>
  );
}
