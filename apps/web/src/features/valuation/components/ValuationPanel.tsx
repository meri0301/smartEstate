import type { Valuation, ValuationVerdict } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatAmd, formatDate, formatPercent } from '../../../shared/i18n/formatters.js';
import { Badge, Card, Heading, Text, type BadgeProps } from '../../../shared/ui/index.js';

export interface ValuationPanelProps {
  valuation: Valuation;
  askingPriceAmd: number;
}

/** Green for a bargain, amber for a stretch, and nothing loud for an ordinary price. */
const VERDICT_TONE: Readonly<Record<ValuationVerdict, NonNullable<BadgeProps['tone']>>> = {
  UNDERPRICED: 'success',
  FAIR: 'neutral',
  OVERPRICED: 'warning',
};

/**
 * The price check.
 *
 * Every number on this panel comes from the model or the database; nothing is
 * generated, and nothing is rounded into a friendlier shape than it deserves.
 * The disclaimer is not decoration either: this is an estimate of what a
 * comparable property is being **asked** for, which is not what one sells for,
 * and a reader who takes it for a valuation would be misled.
 */
export function ValuationPanel({ valuation, askingPriceAmd }: ValuationPanelProps): JSX.Element {
  const { t } = useTranslation('valuation');
  const locale = useCurrentLocale();
  const deviation = valuation.deviationPct / 100;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="valuation-heading">
      <Heading as="h2" id="valuation-heading" size="sm" transform="none">
        {t('title')}
      </Heading>

      <Card tone="muted" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={VERDICT_TONE[valuation.verdict]}>{t(`verdict.${valuation.verdict}`)}</Badge>
          {valuation.isStale && (
            <Badge tone="neutral" size="sm">
              {t('staleBadge')}
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Text size="lg" className="font-semibold">
            {t('estimate', { price: formatAmd(valuation.fairPriceAmd, locale) })}
          </Text>
          <Text size="sm" tone="muted">
            {t('range', {
              low: formatAmd(valuation.lowerBoundAmd, locale),
              high: formatAmd(valuation.upperBoundAmd, locale),
            })}
          </Text>
        </div>

        <Text>
          {t(deviationKey(valuation.deviationPct), {
            percent: formatPercent(Math.abs(deviation), locale, 1),
            asking: formatAmd(askingPriceAmd, locale),
          })}
        </Text>

        {valuation.factors.length > 0 && (
          <div className="flex flex-col gap-2">
            <Text as="span" size="sm" className="font-medium">
              {t('factorsTitle')}
            </Text>
            <ul className="flex flex-col divide-y divide-border">
              {valuation.factors.map((factor) => (
                <li key={factor.feature} className="flex items-baseline justify-between gap-4 py-2">
                  <Text as="span" size="sm">
                    {t(`feature.${factor.feature}`, { defaultValue: factor.feature })}
                  </Text>
                  <Text
                    as="span"
                    size="sm"
                    tone={factor.effect >= 0 ? 'default' : 'muted'}
                    className="whitespace-nowrap font-medium"
                  >
                    {`${formatPercent(factor.effect, locale, 1)} · ${formatAmd(
                      factor.impactAmd,
                      locale,
                      { compact: true },
                    )}`}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        )}

        {valuation.isStale && (
          <Text size="sm" tone="muted">
            {t('stale')}
          </Text>
        )}

        <Text size="sm" tone="muted">
          {t('disclaimer')}
        </Text>
        <Text size="sm" tone="muted">
          {t('model', {
            version: valuation.modelVersion,
            date: formatDate(valuation.calculatedAt, locale, 'medium'),
          })}
        </Text>
      </Card>
    </section>
  );
}

/**
 * Which sentence describes the gap.
 *
 * A listing can be inside the model's range and still sit a few percent either
 * side of the midpoint, so the wording follows the number rather than the
 * verdict; saying "above the estimate" about a price that is below it would be
 * wrong even when the verdict is fair.
 */
type DeviationKey = 'deviationAbove' | 'deviationBelow' | 'deviationLevel';

function deviationKey(deviationPct: number): DeviationKey {
  if (Math.abs(deviationPct) < 1) {
    return 'deviationLevel';
  }
  return deviationPct > 0 ? 'deviationAbove' : 'deviationBelow';
}
