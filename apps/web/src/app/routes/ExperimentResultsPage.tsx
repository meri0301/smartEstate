import type { ArmComparison } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  ArmResultsTable,
  useExperimentResults,
  useExperiments,
} from '../../features/experiments/index.js';
import { useCurrentLocale } from '../../shared/i18n/I18nProvider.js';
import { formatDate, formatNumber } from '../../shared/i18n/formatters.js';
import { Button, Card, Heading, Skeleton, Text } from '../../shared/ui/index.js';

/**
 * The results page the evaluation chapter reads from.
 *
 * Without a key it lists the experiments; with one it shows the arms, their
 * metrics with errors and sample sizes, and — only once every arm has enough
 * sessions — the comparison between them. Below that threshold the page says
 * "not yet" in so many words. A results page that implies a winner from eleven
 * sessions is the most common way an A/B test misleads, and this one is built
 * not to be able to.
 */
export function ExperimentResultsPage(): JSX.Element {
  const { key } = useParams();
  return key === undefined ? <ExperimentList /> : <Results experimentKey={key} />;
}

function ExperimentList(): JSX.Element {
  const { t } = useTranslation('experiments');
  const locale = useCurrentLocale();
  const experiments = useExperiments();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-3xl flex-col gap-2">
        <Heading as="h1" size="lg">
          {t('title')}
        </Heading>
        <Text tone="muted">{t('intro')}</Text>
      </div>
      {experiments.isPending && <Skeleton className="h-24 w-full" />}
      {experiments.data !== undefined && (
        <ul className="flex flex-col gap-4">
          {experiments.data.map((experiment) => (
            <Card as="li" key={experiment.key} className="flex flex-col gap-2">
              <Link
                to={`/${locale}/experiments/${experiment.key}`}
                className="underline-offset-4 hover:underline"
              >
                <Heading as="h2" size="sm" transform="none">
                  {experiment.name}
                </Heading>
              </Link>
              <Text size="sm" tone="muted">
                {experiment.description}
              </Text>
              <Text size="sm" tone="muted">
                {experiment.arms.map((arm) => `${arm.name}: ${arm.method}`).join(' · ')}
              </Text>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}

function Results({ experimentKey }: { experimentKey: string }): JSX.Element {
  const { t } = useTranslation(['experiments', 'common']);
  const locale = useCurrentLocale();
  const results = useExperimentResults(experimentKey);

  if (results.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (results.isError) {
    return (
      <Card tone="outline" className="flex flex-col items-start gap-4">
        <Text tone="danger">{t('experiments:failed')}</Text>
        <Text size="sm" tone="muted">
          {results.error.message}
        </Text>
        <Button
          onClick={() => {
            void results.refetch();
          }}
        >
          {t('common:actions.retry')}
        </Button>
      </Card>
    );
  }

  const data = results.data;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Text size="sm" tone="muted">
          <Link to={`/${locale}/experiments`} className="underline-offset-4 hover:underline">
            {t('experiments:back')}
          </Link>
        </Text>
        <Heading as="h1" size="lg">
          {data.experiment.name}
        </Heading>
        <Text tone="muted">{data.experiment.description}</Text>
      </div>

      <ArmResultsTable results={data} />

      <section className="flex flex-col gap-3">
        <Heading as="h2" size="sm" transform="none">
          {t('experiments:comparisonsTitle')}
        </Heading>
        {data.sufficient ? (
          <ul className="flex flex-col gap-2">
            {data.comparisons.map((comparison) => (
              <Comparison
                key={`${comparison.metric}-${comparison.arms.join('-')}`}
                comparison={comparison}
                k={data.k}
              />
            ))}
          </ul>
        ) : (
          <Card tone="muted">
            <Text>{t('experiments:notYet', { minimum: data.minimumSessionsPerArm })}</Text>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <Heading as="h2" size="sm" transform="none">
          {t('experiments:gainsTitle')}
        </Heading>
        <Text size="sm" tone="muted">
          {t('experiments:gainsIntro')}
        </Text>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {Object.entries(data.relevanceGains)
            .sort(([, a], [, b]) => b - a)
            .map(([type, gain]) => (
              <li key={type}>
                <Text size="sm">
                  {t(`experiments:interaction.${type}` as never)} — {formatNumber(gain, locale)}
                </Text>
              </li>
            ))}
        </ul>
      </section>

      <Text size="sm" tone="muted">
        {t('experiments:computedAt', { when: formatDate(data.computedAt, locale, 'long') })}
      </Text>
    </div>
  );
}

function Comparison({ comparison, k }: { comparison: ArmComparison; k: number }): JSX.Element {
  const { t } = useTranslation('experiments');
  const locale = useCurrentLocale();
  const number = (value: number): string =>
    formatNumber(value, locale, { maximumFractionDigits: 3, signDisplay: 'exceptZero' });

  return (
    <Card
      as="li"
      tone={comparison.distinguishable ? 'outline' : 'muted'}
      className="flex flex-col gap-1"
    >
      <Text weight="medium" tone="strong">
        {t('comparison', {
          first: comparison.arms[0],
          second: comparison.arms[1],
          metric: t(`metric.${comparison.metric}`, { k }),
        })}
      </Text>
      <Text size="sm">
        {t('interval', {
          difference: number(comparison.difference),
          low: number(comparison.confidenceLow),
          high: number(comparison.confidenceHigh),
        })}
      </Text>
      <Text size="sm" tone="muted">
        {t(comparison.distinguishable ? 'distinguishable' : 'indistinguishable')}
      </Text>
    </Card>
  );
}
