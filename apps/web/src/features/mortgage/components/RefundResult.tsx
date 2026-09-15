import type { IneligibilityReason, MortgageRefund } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatAmd, formatNumber } from '../../../shared/i18n/formatters.js';
import { Badge, Card, Heading, Text } from '../../../shared/ui/index.js';

export interface RefundResultProps {
  refund: MortgageRefund;
  /** The nominal rate that was asked about, for the "behaves like" sentence. */
  annualRatePct: number;
  termYears: number;
}

/**
 * What the buyer gets back, or why they get nothing.
 *
 * A refusal is given the same weight as an award and is never a shrug: every
 * failed condition is listed, and the amount that was missed is shown beside it.
 * Somebody who learns here that moving thirty kilometres would be worth twelve
 * million dram has been told something worth knowing, and hiding it behind "not
 * eligible" would waste the only genuinely local thing this product knows.
 *
 * Every figure comes from the API. The assumption behind the total — that the
 * buyer keeps paying that much income tax for the whole term — is stated next to
 * it rather than left for somebody to work out.
 */
export function RefundResult({ refund, annualRatePct, termYears }: RefundResultProps): JSX.Element {
  const { t } = useTranslation('mortgage');
  const locale = useCurrentLocale();

  return (
    <div className="flex flex-col gap-6">
      <Card tone={refund.eligible ? 'outline' : 'muted'} className="flex flex-col gap-4">
        <Heading as="h2" size="sm" transform="none">
          {t(refund.eligible ? 'result.eligibleTitle' : 'result.ineligibleTitle')}
        </Heading>

        {refund.eligible ? (
          <>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Figure
                label={t('result.quarterly')}
                value={formatAmd(refund.quarterlyRefund, locale)}
              />
              <Figure
                label={t('result.total')}
                value={formatAmd(refund.totalRefundOverTerm, locale)}
              />
            </dl>
            <Text weight="medium" tone="strong">
              {t('result.effectiveRate', {
                nominal: formatNumber(annualRatePct, locale, { maximumFractionDigits: 2 }),
                effective: formatNumber(refund.effectiveInterestRate, locale, {
                  maximumFractionDigits: 2,
                }),
              })}
            </Text>
            <Text size="sm" tone="muted">
              {t('result.assumption', { years: termYears })}
            </Text>
          </>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {refund.ineligibilityReasons.map((reason) => (
                <li key={reason.code}>
                  <Text size="sm">
                    <Reason reason={reason} />
                  </Text>
                </li>
              ))}
            </ul>
            {refund.forgoneQuarterlyRefund !== undefined && refund.forgoneQuarterlyRefund > 0 && (
              <Text weight="medium" tone="strong">
                {t('result.wouldHaveBeen', {
                  amount: formatAmd(refund.forgoneQuarterlyRefund, locale),
                })}
              </Text>
            )}
          </>
        )}
      </Card>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Figure
          label={t('result.monthlyPayment')}
          value={formatAmd(refund.monthlyPaymentAmd, locale)}
        />
        <Figure
          label={t('result.totalInterest')}
          value={formatAmd(refund.totalInterestAmd, locale)}
        />
      </dl>

      {refund.eligible && refund.schedule.length > 0 && (
        <section className="flex flex-col gap-3">
          <Heading as="h3" size="sm" transform="none">
            {t('result.scheduleTitle')}
          </Heading>
          <div className="max-h-80 overflow-auto">
            <table className="w-full border-collapse text-start">
              <thead>
                <tr>
                  <th scope="col" className="p-2 text-start">
                    <Text size="sm" tone="muted">
                      {t('result.year')}
                    </Text>
                  </th>
                  <th scope="col" className="p-2 text-start">
                    <Text size="sm" tone="muted">
                      {t('result.interest')}
                    </Text>
                  </th>
                  <th scope="col" className="p-2 text-start">
                    <Text size="sm" tone="muted">
                      {t('result.refund')}
                    </Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {refund.schedule.map((year) => (
                  <tr key={year.year} className="border-t border-border">
                    <th scope="row" className="p-2 text-start font-normal">
                      <Text size="sm">{formatNumber(year.year, locale)}</Text>
                    </th>
                    <td className="p-2">
                      <Text size="sm">{formatAmd(year.interestAmd, locale)}</Text>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <Text size="sm">{formatAmd(year.refundAmd, locale)}</Text>
                        {year.cappedInAnyQuarter && (
                          <Badge tone="neutral" size="sm">
                            {t('result.capped')}
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-1">
        {refund.ruleSetVersion !== undefined && (
          <Text size="sm" tone="muted">
            {t('result.ruleSet', { version: refund.ruleSetVersion })}
          </Text>
        )}
        {/* Required, and not in small print: this is money and tax, and the
            product is not qualified to be believed about either. */}
        <Text size="sm" tone="muted">
          {t('disclaimer')}
        </Text>
      </div>
    </div>
  );
}

/**
 * One reason, translated from a code the server chose.
 *
 * The province arrives as an enum and is translated before it is interpolated,
 * so a Russian reader is not told the scheme ended in "YEREVAN".
 */
function Reason({ reason }: { reason: IneligibilityReason }): JSX.Element {
  const { t } = useTranslation('mortgage');
  const locale = useCurrentLocale();

  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(reason.params)) {
    if (key === 'marz' && typeof value === 'string') {
      params[key] = t(`marz.${value}` as never);
    } else if (key === 'maxPropertyValueAmd' && typeof value === 'number') {
      params[key] = formatAmd(value, locale);
    } else {
      params[key] = value;
    }
  }

  // The key comes from the server as `mortgage:ineligible.x`; this component is
  // already inside that namespace, so the prefix is stripped rather than the
  // namespace repeated.
  const key = reason.messageKey.replace(/^mortgage:/, '');
  return <>{t(key as never, params)}</>;
}

function Figure({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <dt>
        <Text size="sm" tone="muted">
          {label}
        </Text>
      </dt>
      <dd>
        <Text weight="semibold" tone="strong">
          {value}
        </Text>
      </dd>
    </div>
  );
}
