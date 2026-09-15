import type { AlternativeListing } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatAmd, formatNumber } from '../../../shared/i18n/formatters.js';
import { Badge, Button, Card, Heading, Text } from '../../../shared/ui/index.js';

export interface AlternativeCardProps {
  alternative: AlternativeListing;
  href: string;
  /** Whether this option is in the comparison table. */
  isCompared: boolean;
  /** Ignored when the table is already full and this option is not in it. */
  canCompare: boolean;
  onToggleCompare: () => void;
}

/**
 * One better option, with what it gains and what it costs.
 *
 * The losses are shown as prominently as the gains and never behind a "show
 * more". An advisor that buries the trade-off is an advertisement with extra
 * steps, and a buyer who discovers the top floor has no lift after the viewing
 * was misled by this page, not by the listing.
 */
export function AlternativeCard({
  alternative,
  href,
  isCompared,
  canCompare,
  onToggleCompare,
}: AlternativeCardProps): JSX.Element {
  const { t } = useTranslation(['alternatives', 'listings', 'common']);
  const locale = useCurrentLocale();

  const gains = alternative.comparisons.filter((entry) => entry.direction === 'better');
  const losses = alternative.comparisons.filter((entry) => entry.direction === 'worse');

  return (
    // A labelled group, so a screen reader can move between options by name and
    // a reader is never left wondering which card a trade-off belongs to.
    <Card role="group" aria-label={alternative.listing.title} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <a href={href} className="underline-offset-4 hover:underline">
            <Heading as="h3" size="sm" transform="none">
              {alternative.listing.title}
            </Heading>
          </a>
          <Text tone="muted" size="sm">
            {formatAmd(alternative.listing.priceAmd, locale)} ·{' '}
            {t('listings:roomCount', { count: alternative.listing.rooms })} ·{' '}
            {t('listings:area', { area: formatNumber(alternative.listing.totalArea, locale) })}
          </Text>
        </div>
        <Badge tone={alternative.relation === 'DOMINATES' ? 'success' : 'neutral'}>
          {t(`alternatives:relation.${alternative.relation}`)}
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <Reasons
          label={t('alternatives:betterOn', { count: gains.length })}
          entries={gains.map((entry) => t(`alternatives:criterion.${entry.criterion}`))}
          tone="success"
        />
        {losses.length > 0 && (
          <Reasons
            label={t('alternatives:worseOn', { count: losses.length })}
            entries={losses.map((entry) => t(`alternatives:criterion.${entry.criterion}`))}
            tone="danger"
          />
        )}
        {alternative.relation === 'DOMINATES' && (
          <Text size="sm" tone="muted">
            {t('alternatives:givesUpNothing')}
          </Text>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={isCompared ? 'primary' : 'outline'}
          size="sm"
          aria-pressed={isCompared}
          disabled={!isCompared && !canCompare}
          onClick={onToggleCompare}
        >
          {t(isCompared ? 'alternatives:removeFromTable' : 'alternatives:addToTable')}
        </Button>
        <a
          href={href}
          className="inline-flex h-control-sm items-center px-4 font-body text-sm text-text underline-offset-4 hover:underline"
        >
          {t('alternatives:viewListing')}
        </a>
      </div>
    </Card>
  );
}

function Reasons({
  label,
  entries,
  tone,
}: {
  label: string;
  entries: string[];
  tone: 'success' | 'danger';
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <Text size="sm" tone={tone} weight="medium">
        {label}
      </Text>
      <Text size="sm" tone="muted">
        {entries.join(' · ')}
      </Text>
    </div>
  );
}
