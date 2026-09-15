import type { AlternativeListing } from '@smartestate/contracts';
import { useCallback, useMemo, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  AlternativeCard,
  buildComparison,
  ComparisonTable,
  MAX_COMPARED,
  useAlternatives,
} from '../../features/alternatives/index.js';
import { useListing } from '../../features/listings/index.js';
import { useCurrentLocale } from '../../shared/i18n/I18nProvider.js';
import { formatAmd } from '../../shared/i18n/formatters.js';
import { Button, Card, Heading, Skeleton, Text } from '../../shared/ui/index.js';

/**
 * The advisor page: is there anything better than this, and what would it cost?
 *
 * The page is built around a claim rather than a list. Options that give up
 * nothing come first and are labelled as such; the rest say what they ask in
 * exchange, in the same size type as what they offer. Nothing here is behind a
 * "show more", because a trade-off a reader has to expand is a trade-off the
 * page is hoping they will not read.
 *
 * Every number comes from the API. The comparison table decides which cell wins
 * a row, which is a maximum over figures the server computed and not a second
 * opinion about what better means.
 */
export function AlternativesPage(): JSX.Element {
  const { t } = useTranslation(['alternatives', 'listings', 'common']);
  const locale = useCurrentLocale();
  const { idOrPublicId } = useParams();
  // The address carries whichever identifier the reader followed, and the
  // comparison endpoint takes the internal one — so the listing is resolved
  // first, exactly as the valuation panel does. The query is already cached by
  // the detail page a reader almost always arrives from, so this is usually free.
  const listing = useListing(idOrPublicId ?? '', locale);
  const alternatives = useAlternatives({ listingId: listing.data?.id, locale, limit: 6 });

  /**
   * The reader's selection, or `undefined` until they make one.
   *
   * Not an empty array: an empty table is useless on arrival, so the strongest
   * few options are shown by default. The two states have to be distinguishable
   * or the first click on a card that is already in the table reads as "remove"
   * and behaves as "add" — which is exactly what it did until the page was
   * opened in a browser.
   */
  const [comparedIds, setComparedIds] = useState<string[] | undefined>(undefined);

  const data = alternatives.data;

  /** What the table shows before anybody has chosen: the strongest few. */
  const defaultIds = useMemo(
    () => (data?.alternatives ?? []).slice(0, MAX_COMPARED - 1).map((entry) => entry.listing.id),
    [data],
  );

  const selectedIds = comparedIds ?? defaultIds;

  const toggleCompare = useCallback(
    (listingId: string) => {
      setComparedIds((current) => {
        const base = current ?? defaultIds;
        return base.includes(listingId)
          ? base.filter((id) => id !== listingId)
          : [...base, listingId];
      });
    },
    [defaultIds],
  );

  /** The chosen listings, in the order the server ranked them rather than click order. */
  const compared: AlternativeListing[] = useMemo(
    () => (data?.alternatives ?? []).filter((entry) => selectedIds.includes(entry.listing.id)),
    [data, selectedIds],
  );

  const table = useMemo(
    () => (data === undefined ? undefined : buildComparison(data.subject, data.criteria, compared)),
    [data, compared],
  );

  const hrefOf = useCallback(
    (_listingId: string, publicId: string): string => `/${locale}/listings/${publicId}`,
    [locale],
  );

  if (listing.isPending || alternatives.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const failure = listing.error ?? alternatives.error;
  if (failure !== null || data === undefined) {
    return (
      <Card tone="outline" className="flex flex-col items-start gap-4">
        <Text tone="danger">{t('alternatives:failed')}</Text>
        {failure !== null && (
          <Text size="sm" tone="muted">
            {failure.message}
          </Text>
        )}
        <Button
          onClick={() => {
            void (listing.error !== null ? listing.refetch() : alternatives.refetch());
          }}
        >
          {t('common:actions.retry')}
        </Button>
      </Card>
    );
  }

  const dominant = data.alternatives.filter((entry) => entry.relation === 'DOMINATES');

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Text size="sm" tone="muted">
          <a
            href={`/${locale}/listings/${data.subject.publicId}`}
            className="underline-offset-4 hover:underline"
          >
            {t('alternatives:backToListing', { title: data.subject.title })}
          </a>
        </Text>
        <Heading as="h1" size="lg">
          {t('alternatives:title')}
        </Heading>
        <Text tone="muted">
          {t('alternatives:subtitle', {
            title: data.subject.title,
            price: formatAmd(data.subject.priceAmd, locale),
            count: data.candidateCount,
          })}
        </Text>
      </div>

      <Verdict dominantCount={dominant.length} total={data.alternatives.length} />

      {data.omittedCriteria.length > 0 && (
        <Text size="sm" tone="muted">
          {t('alternatives:omitted', {
            criteria: data.omittedCriteria
              .map((criterion) => t(`alternatives:criterion.${criterion}`))
              .join(', '),
          })}
        </Text>
      )}

      {data.alternatives.length > 0 && (
        <section className="flex flex-col gap-4">
          <Heading as="h2" size="sm" transform="none">
            {t('alternatives:tableTitle')}
          </Heading>
          {table !== undefined && <ComparisonTable table={table} hrefOf={hrefOf} />}
          <Text size="sm" tone="muted">
            {t('alternatives:tableHint', { max: MAX_COMPARED })}
          </Text>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <Heading as="h2" size="sm" transform="none">
          {t('alternatives:optionsTitle', { count: data.alternatives.length })}
        </Heading>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.alternatives.map((alternative) => (
            <AlternativeCard
              key={alternative.listing.id}
              alternative={alternative}
              href={hrefOf(alternative.listing.id, alternative.listing.publicId)}
              isCompared={compared.some((entry) => entry.listing.id === alternative.listing.id)}
              canCompare={compared.length < MAX_COMPARED - 1}
              onToggleCompare={() => {
                toggleCompare(alternative.listing.id);
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * The headline answer, before any of the detail.
 *
 * "Nothing is better than this" is the most useful thing this page can say and
 * the easiest to bury, so it is said first and on its own.
 */
function Verdict({ dominantCount, total }: { dominantCount: number; total: number }): JSX.Element {
  const { t } = useTranslation('alternatives');
  const key =
    total === 0 ? 'verdict.none' : dominantCount > 0 ? 'verdict.dominated' : 'verdict.tradeOffs';

  return (
    <Card tone={dominantCount > 0 ? 'outline' : 'muted'}>
      <Text weight="medium" tone="strong">
        {t(key, { count: dominantCount > 0 ? dominantCount : total })}
      </Text>
    </Card>
  );
}
