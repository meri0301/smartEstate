import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../shared/i18n/I18nProvider.js';
import {
  formatAmd,
  formatDate,
  formatPricePerSqm,
  formatRelativeTime,
} from '../../shared/i18n/formatters.js';
import { Badge, Card, CardBody, CardHeader, Heading, Text } from '../../shared/ui/index.js';

/**
 * Placeholder landing view.
 *
 * It exists so that locale routing, the translated shell and the locale-aware
 * formatters can be exercised end to end before the real screens arrive in the
 * next phase. The numbers are illustrative, not data.
 */
/** Illustrative only; real listings arrive from the API in the next phase. */
const PUBLISHED_AT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

export function HomePage(): JSX.Element {
  const { t } = useTranslation(['common', 'listings']);
  const locale = useCurrentLocale();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Heading as="h1" size="lg">
          {t('common:brand')}
        </Heading>
        <Text size="lg">{t('common:tagline')}</Text>
      </div>

      <Card tone="muted" className="max-w-lg">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading as="h2" size="sm">
              {t('listings:resultCount', { count: 3 })}
            </Heading>
            <Badge tone="success">{t('listings:verdict.underpriced')}</Badge>
          </div>
        </CardHeader>
        <CardBody>
          <Text>{t('listings:roomCount', { count: 3 })}</Text>
          <Text>{formatAmd(45_000_000, locale)}</Text>
          <Text>{formatPricePerSqm(625_000, locale)}</Text>
          <Text tone="muted" size="sm">
            {t('listings:publishedRelative', { when: formatRelativeTime(PUBLISHED_AT, locale) })}
          </Text>
          <Text tone="muted" size="sm">
            {formatDate(PUBLISHED_AT, locale, 'long')}
          </Text>
        </CardBody>
      </Card>
    </div>
  );
}
