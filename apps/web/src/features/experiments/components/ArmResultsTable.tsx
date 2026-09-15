import type { ArmResults, ExperimentResults, MetricEstimate } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatNumber } from '../../../shared/i18n/formatters.js';
import { Text } from '../../../shared/ui/index.js';

export interface ArmResultsTableProps {
  results: ExperimentResults;
}

const METRICS = ['clickThroughRate', 'precisionAtK', 'ndcgAtK'] as const;

/**
 * One row per arm, one column per metric, the sample size in every cell.
 *
 * The standard error is printed beside every mean rather than hidden in a
 * tooltip, because a mean without its error is the single most common way a
 * results page lies. A cell with no sessions says "no data", not "0", since a
 * zero is a measurement and an absence is not.
 */
export function ArmResultsTable({ results }: ArmResultsTableProps): JSX.Element {
  const { t } = useTranslation('experiments');
  const locale = useCurrentLocale();
  const totalWeight = results.experiment.arms.reduce((sum, arm) => sum + arm.weight, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-start">
        <thead>
          <tr>
            <th scope="col" className="p-3 text-start align-bottom">
              <Text size="sm" tone="muted">
                {t('arms')}
              </Text>
            </th>
            {METRICS.map((metric) => (
              <th key={metric} scope="col" className="p-3 text-start align-bottom">
                <div className="flex flex-col gap-1">
                  <Text size="sm" weight="medium">
                    {t(`metric.${metric}`, { k: results.k })}
                  </Text>
                  <Text size="sm" tone="muted">
                    {t(`metricHint.${metric}`, { k: results.k })}
                  </Text>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.arms.map((arm) => (
            <tr key={arm.arm.name} className="border-t border-border">
              <th scope="row" className="p-3 text-start align-top font-normal">
                <ArmHeading arm={arm} totalWeight={totalWeight} />
              </th>
              {METRICS.map((metric) => (
                <td key={metric} className="p-3 align-top">
                  <Estimate estimate={arm[metric]} locale={locale} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArmHeading({ arm, totalWeight }: { arm: ArmResults; totalWeight: number }): JSX.Element {
  const { t } = useTranslation('experiments');
  const locale = useCurrentLocale();
  return (
    <div className="flex flex-col gap-1">
      <Text weight="medium" tone="strong">
        {t('arm', { name: arm.arm.name })}
      </Text>
      <Text size="sm" tone="muted">
        {t('allocation', {
          share: formatNumber((arm.arm.weight / totalWeight) * 100, locale, {
            maximumFractionDigits: 0,
          }),
          strategy: arm.arm.strategy,
          method: arm.arm.method,
        })}
      </Text>
      <Text size="sm" tone="muted">
        {t('sessions', { count: arm.sessions })} ·{' '}
        {t('withFeedback', { count: arm.sessionsWithFeedback })}
      </Text>
    </div>
  );
}

function Estimate({
  estimate,
  locale,
}: {
  estimate: MetricEstimate;
  locale: ReturnType<typeof useCurrentLocale>;
}): JSX.Element {
  const { t } = useTranslation('experiments');
  if (estimate.n === 0) {
    return (
      <Text size="sm" tone="muted">
        {t('noData')}
      </Text>
    );
  }
  return (
    <div className="flex flex-col">
      <Text weight="semibold" tone="strong">
        {formatNumber(estimate.mean, locale, { maximumFractionDigits: 3 })}
      </Text>
      {estimate.standardError !== undefined && (
        <Text size="sm" tone="muted">
          {t('se', {
            value: formatNumber(estimate.standardError, locale, { maximumFractionDigits: 3 }),
          })}
        </Text>
      )}
      <Text size="sm" tone="muted">
        n = {formatNumber(estimate.n, locale)}
      </Text>
    </div>
  );
}
