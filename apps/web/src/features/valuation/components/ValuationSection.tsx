import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Heading, Skeleton, Text } from '../../../shared/ui/index.js';
import { useValuationQuote } from '../api/use-valuation-quote.js';
import { QuoteForm } from './QuoteForm.js';
import { QuoteVerdict } from './QuoteVerdict.js';

/** Anchor target for the header's "Valuation" link. */
export const VALUATION_ID = 'valuation';

const HEADING_ID = 'valuation-heading';

/**
 * The landing page's valuation calculator: the form on the left, the verdict on
 * the right.
 *
 * The two panels sit side by side from `md` and stack below it, and the verdict
 * keeps its place before it has anything to say — a panel that appears and
 * shifts the page down as the answer arrives is harder to read than one that
 * was always there.
 */
export function ValuationSection(): JSX.Element {
  const { t } = useTranslation('valuation');
  const quote = useValuationQuote();

  return (
    <section id={VALUATION_ID} aria-labelledby={HEADING_ID} className="mt-16 scroll-mt-8 md:mt-20">
      <div className="flex max-w-2xl flex-col gap-2">
        <Heading as="h2" size="md" id={HEADING_ID}>
          {t('quote.title')}
        </Heading>
        <Text tone="muted">{t('quote.intro')}</Text>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-7 md:grid-cols-[3fr_2fr] md:items-start">
        <QuoteForm
          isSubmitting={quote.isPending}
          onSubmit={(request) => {
            quote.mutate(request);
          }}
        />

        <Card tone="muted" padding="lg" className="md:sticky md:top-8">
          {quote.isPending && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {!quote.isPending && quote.isError && (
            <div className="flex flex-col gap-2">
              <Text tone="danger">{t('quote.result.failed')}</Text>
              <Text size="sm" tone="muted">
                {quote.error.message}
              </Text>
            </div>
          )}

          {!quote.isPending && !quote.isError && quote.data === undefined && (
            <div className="flex flex-col gap-2">
              <Heading as="h3" size="sm" transform="none">
                {t('quote.result.title')}
              </Heading>
              <Text size="sm" tone="muted">
                {t('quote.result.empty')}
              </Text>
            </div>
          )}

          {!quote.isPending && quote.data !== undefined && (
            <QuoteVerdict
              quote={quote.data}
              onRestart={() => {
                quote.reset();
              }}
            />
          )}
        </Card>
      </div>
    </section>
  );
}
