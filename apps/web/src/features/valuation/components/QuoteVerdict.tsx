import type { ValuationQuote } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatAmd, formatNumber } from '../../../shared/i18n/formatters.js';
import { Badge, Heading, Text } from '../../../shared/ui/index.js';

export interface QuoteVerdictProps {
  quote: ValuationQuote;
  onRestart: () => void;
}

/** Deviation is a signed percentage; anything inside this reads as level. */
const LEVEL_WITHIN_PCT = 1;

const VERDICT_TONE = {
  UNDERPRICED: 'success',
  FAIR: 'warning',
  OVERPRICED: 'danger',
} as const;

/**
 * The answer, with everything needed to disbelieve it.
 *
 * The estimate is a range rather than a number because that is what the model
 * produces, and collapsing it to a point would be the single most misleading
 * thing this page could do. Beside it sit the two things that decide how much
 * weight the range deserves: how much of the catalogue stands near this
 * property, and how tight the range is. Neither is a probability and the panel
 * says so.
 *
 * Every substitution the service made for a blank field is listed. A reader who
 * did not know the year their building went up should be able to see which year
 * was used, because that is the figure they would want to correct.
 */
export function QuoteVerdict({ quote, onRestart }: QuoteVerdictProps): JSX.Element {
  const { t } = useTranslation(['valuation', 'common']);
  const locale = useCurrentLocale();

  const percent = (value: number): string =>
    `${formatNumber(Math.abs(value), locale, { maximumFractionDigits: 1 })}%`;

  const position =
    Math.abs(quote.deviationPct) < LEVEL_WITHIN_PCT
      ? t('valuation:quote.result.level')
      : t(
          quote.deviationPct > 0 ? 'valuation:quote.result.above' : 'valuation:quote.result.below',
          {
            percent: percent(quote.deviationPct),
          },
        );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Heading as="h3" size="sm" transform="none">
          {t('valuation:quote.result.title')}
        </Heading>
        <Text size="sm" tone="muted">
          {t('valuation:quote.result.intro')}
        </Text>
      </div>

      <div>
        <Badge tone={VERDICT_TONE[quote.verdict]}>{t(`valuation:verdict.${quote.verdict}`)}</Badge>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <Text size="sm" tone="muted">
          {t('valuation:quote.result.fairValue')}
        </Text>
        <Text size="lg" weight="semibold" tone="strong">
          {formatAmd(quote.lowerBoundAmd, locale)} – {formatAmd(quote.upperBoundAmd, locale)}
        </Text>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <Text size="sm" tone="muted">
          {t('valuation:quote.result.marketPosition')}
        </Text>
        <Text weight="medium" tone="strong">
          {position}
        </Text>
      </div>

      <Meter
        label={t('valuation:quote.result.evidenceLabel', {
          level: t(`valuation:quote.result.evidence.${quote.evidence}`),
        })}
        detail={t('valuation:quote.result.evidenceCount', { count: quote.comparableCount })}
        value={EVIDENCE_FILL[quote.evidence]}
        tone={quote.evidence === 'THIN' ? 'warning' : 'accent'}
      />

      <Meter
        label={t('valuation:quote.result.confidence')}
        detail={t('valuation:quote.result.confidenceHint')}
        value={quote.confidence}
        tone="accent"
      />

      {quote.grossRentalYieldPct !== undefined && (
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <Text size="sm" tone="muted">
            {t('valuation:quote.result.yield')}
          </Text>
          <Text weight="medium" tone="strong">
            {t('valuation:quote.result.yieldValue', {
              percent: percent(quote.grossRentalYieldPct),
            })}
          </Text>
        </div>
      )}

      {quote.factors.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Text size="sm" tone="muted">
            {t('valuation:quote.result.reasonsTitle')}
          </Text>
          <ul className="flex flex-col gap-1">
            {quote.factors.map((factor) => (
              <li key={factor.feature} className="flex justify-between gap-4">
                <Text size="sm">{t(`valuation:feature.${factor.feature}` as never)}</Text>
                <Text size="sm" tone="muted">
                  {formatNumber(factor.effect * 100, locale, {
                    maximumFractionDigits: 1,
                    signDisplay: 'exceptZero',
                  })}
                  %
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Text size="sm" tone="muted">
          {t('valuation:quote.result.assumptionsTitle')}
        </Text>
        <ul className="flex flex-col gap-1">
          {quote.assumptions.map((assumption) => (
            <li key={assumption.field}>
              <Text size="sm">
                {t(`valuation:quote.result.assumed.${assumption.field}` as never, {
                  value: assumption.value,
                })}
              </Text>
            </li>
          ))}
        </ul>
      </div>

      <Text size="xs" tone="muted">
        {t('valuation:disclaimer')}
      </Text>
      <Text size="xs" tone="muted">
        {t('valuation:model', {
          version: quote.modelVersion,
          date: new Date(quote.calculatedAt).toLocaleDateString(locale),
        })}
      </Text>

      <button
        type="button"
        onClick={onRestart}
        className="self-start font-body text-sm text-text-secondary underline underline-offset-4 hover:text-text"
      >
        {t('valuation:quote.result.restart')}
      </button>
    </div>
  );
}

/** How full the evidence bar is drawn at each band. Presentation only. */
const EVIDENCE_FILL = { THIN: 0.25, MODERATE: 0.6, STRONG: 1 } as const;

/**
 * A labelled bar.
 *
 * `role="meter"` rather than a progress bar: nothing here is progressing
 * towards completion, and the value is announced with its bounds so a screen
 * reader hears the same quantity the bar draws.
 */
function Meter({
  label,
  detail,
  value,
  tone,
}: {
  label: string;
  detail: string;
  value: number;
  tone: 'accent' | 'warning';
}): JSX.Element {
  const percent = Math.round(value * 100);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <Text size="sm" weight="medium" tone="strong">
        {label}
      </Text>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className={tone === 'warning' ? 'h-full bg-warning' : 'h-full bg-accent'}
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      <Text size="xs" tone="muted">
        {detail}
      </Text>
    </div>
  );
}
