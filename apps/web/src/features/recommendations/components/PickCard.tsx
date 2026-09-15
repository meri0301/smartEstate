import type { ExplanationHighlight, RankedListing } from '@smartestate/contracts';
import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatAmd, formatNumber } from '../../../shared/i18n/formatters.js';
import { Badge, Button, Card, Heading, Text } from '../../../shared/ui/index.js';

export interface PickCardProps {
  item: RankedListing;
  /** Path of the detail page; the locale segment stays with the caller. */
  to: string;
  /** Called for every outcome worth recording: opening, saving, dismissing. */
  onInteract: (type: 'VIEW' | 'FAVORITE' | 'UNFAVORITE' | 'DISMISS') => void;
}

/**
 * One recommended listing, with the reasons it is where it is.
 *
 * This is where the computed explanation of ADR-0014 is finally rendered: the
 * criteria that placed the listing, strengths first, each with its figure
 * formatted in the reader's locale. The paragraph a model may have written is
 * shown beneath them when there is one; the highlights are the explanation and
 * the prose is phrasing.
 *
 * Every action a reader can take here is an outcome for the ranking that showed
 * the listing, so each one is reported — including dismissal, which is the
 * clearest verdict a reader gives and the one most interfaces throw away.
 */
export function PickCard({ item, to, onInteract }: PickCardProps): JSX.Element {
  const { t } = useTranslation(['picks', 'listings']);
  const locale = useCurrentLocale();
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const strengths = item.explanation.highlights.filter((h) => h.kind === 'strength');
  const tradeoffs = item.explanation.highlights.filter((h) => h.kind === 'tradeoff');

  if (dismissed) {
    return (
      <Card tone="muted" role="group" aria-label={item.listing.title}>
        <Text size="sm" tone="muted">
          {t('picks:results.dismissed')} · {item.listing.title}
        </Text>
      </Card>
    );
  }

  return (
    <Card role="group" aria-label={item.listing.title} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Text size="sm" tone="muted">
            #{formatNumber(item.rank, locale)}
          </Text>
          <Link
            to={to}
            className="underline-offset-4 hover:underline"
            onClick={() => {
              onInteract('VIEW');
            }}
          >
            <Heading as="h3" size="sm" transform="none">
              {item.listing.title}
            </Heading>
          </Link>
          <Text size="sm" tone="muted">
            {formatAmd(item.listing.priceAmd, locale)} ·{' '}
            {t('listings:roomCount', { count: item.listing.rooms })} ·{' '}
            {t('listings:area', { area: formatNumber(item.listing.totalArea, locale) })} ·{' '}
            {item.listing.district.name[locale]}
          </Text>
        </div>
        <Badge tone="neutral">
          {formatNumber(item.score, locale, { maximumFractionDigits: 2 })}
        </Badge>
      </div>

      {strengths.length > 0 && (
        <Reasons label={t('picks:results.strengths')} highlights={strengths} tone="success" />
      )}
      {tradeoffs.length > 0 && (
        <Reasons label={t('picks:results.tradeoffs')} highlights={tradeoffs} tone="danger" />
      )}

      {item.explanation.text !== undefined && (
        <Text size="sm" tone="muted">
          {item.explanation.text}
        </Text>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={saved ? 'primary' : 'outline'}
          size="sm"
          aria-pressed={saved}
          onClick={() => {
            const next = !saved;
            setSaved(next);
            onInteract(next ? 'FAVORITE' : 'UNFAVORITE');
          }}
        >
          {t(saved ? 'picks:results.unfavourite' : 'picks:results.favourite')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDismissed(true);
            onInteract('DISMISS');
          }}
        >
          {t('picks:results.dismiss')}
        </Button>
      </div>
    </Card>
  );
}

/**
 * A group of reasons with their figures.
 *
 * The figure is a number with a named key from the server; the sentence around
 * it is the client's, in the reader's language. Condition has no figure — it is
 * a name, not a number — and shows as the criterion alone.
 */
function Reasons({
  label,
  highlights,
  tone,
}: {
  label: string;
  highlights: readonly ExplanationHighlight[];
  tone: 'success' | 'danger';
}): JSX.Element {
  const { t } = useTranslation('picks');
  const locale = useCurrentLocale();

  return (
    <div className="flex flex-col gap-1">
      <Text size="sm" tone={tone} weight="medium">
        {label}
      </Text>
      <ul className="flex flex-col gap-0.5">
        {highlights.map((highlight) => (
          <li key={highlight.criterion}>
            <Text size="sm">
              {t(`criterion.${highlight.criterion}`)}
              {highlight.fact !== undefined && (
                <>
                  {' — '}
                  {formatFact(highlight.fact.key, highlight.fact.value, locale, t)}
                </>
              )}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatFact(
  key: NonNullable<ExplanationHighlight['fact']>['key'],
  value: number,
  locale: ReturnType<typeof useCurrentLocale>,
  t: ReturnType<typeof useTranslation<'picks'>>['t'],
): string {
  switch (key) {
    case 'rooms':
      return t('fact.rooms', { count: value });
    case 'buildingAgeYears':
      return t('fact.buildingAgeYears', { count: Math.round(value) });
    case 'budgetHeadroomPct':
    case 'priceVsEstimatePct':
      return t(`fact.${key}`, {
        value: formatNumber(value, locale, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }),
      });
    case 'areaSqm':
    case 'distanceM':
      return t(`fact.${key}`, { value: formatNumber(value, locale) });
  }
}
