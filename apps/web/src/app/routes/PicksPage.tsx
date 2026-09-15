import type { InteractionType, RankedListing } from '@smartestate/contracts';
import { useCallback, useState, type JSX, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useDistricts } from '../../features/geo/index.js';
import { useRecordInteraction } from '../../features/interactions/index.js';
import { PickCard, useRecommendations } from '../../features/recommendations/index.js';
import { useCurrentLocale } from '../../shared/i18n/I18nProvider.js';
import { Button, Card, Heading, Input, Text } from '../../shared/ui/index.js';

/** The experiment every ranking from this page is served under. */
const EXPERIMENT_KEY = 'ranking-method';

/**
 * The recommender's first interface, and the harness's exposure surface.
 *
 * Every ranking asked for here runs under the `ranking-method` experiment: the
 * server assigns this browser an arm and records the session under it. Every
 * click, save or dismissal on the results is sent back with that session id,
 * which is what turns it into a verdict on the ranking that produced it.
 *
 * The page is deliberately plain. Its job is to show a ranking honestly — with
 * the reasons each listing is where it is — and to get out of the way of the
 * reader's judgement, which is the thing being measured.
 */
export function PicksPage(): JSX.Element {
  const { t } = useTranslation(['picks', 'common']);
  const locale = useCurrentLocale();
  const districts = useDistricts();
  const recommendations = useRecommendations();
  const record = useRecordInteraction();

  const [form, setForm] = useState({
    budgetAmd: 60_000_000,
    roomsMin: 2,
    districts: [] as string[],
  });

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    recommendations.mutate({
      preferences: {
        budgetAmd: form.budgetAmd,
        roomsMin: form.roomsMin,
        districts: form.districts,
      },
      limit: 10,
      experimentKey: EXPERIMENT_KEY,
    });
  };

  const sessionId = recommendations.data?.sessionId;
  const interact = useCallback(
    (item: RankedListing, type: InteractionType): void => {
      // Fire and forget: the reader's click must not wait on the record, and a
      // failure to record it is the experiment's loss and never theirs.
      record.mutate({
        listingId: item.listing.id,
        type,
        ...(sessionId === undefined ? {} : { sessionId }),
      });
    },
    [record, sessionId],
  );

  const toggleDistrict = (slug: string): void => {
    setForm((current) => ({
      ...current,
      districts: current.districts.includes(slug)
        ? current.districts.filter((entry) => entry !== slug)
        : [...current.districts, slug],
    }));
  };

  const data = recommendations.data;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-3xl flex-col gap-2">
        <Heading as="h1" size="lg">
          {t('picks:title')}
        </Heading>
        <Text tone="muted">{t('picks:intro')}</Text>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-6">
        <Card tone="muted" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              type="number"
              label={t('picks:form.budget')}
              value={String(form.budgetAmd)}
              onChange={(event) => {
                const value = Number(event.target.value);
                setForm((current) => ({
                  ...current,
                  budgetAmd: Number.isFinite(value) ? value : 0,
                }));
              }}
            />
            <Input
              type="number"
              label={t('picks:form.roomsMin')}
              value={String(form.roomsMin)}
              onChange={(event) => {
                const value = Number(event.target.value);
                setForm((current) => ({
                  ...current,
                  roomsMin: Number.isFinite(value) ? value : 1,
                }));
              }}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend>
              <Text size="sm" weight="medium">
                {t('picks:form.districts')}
              </Text>
            </legend>
            <Text size="sm" tone="muted">
              {t('picks:form.districtsHint')}
            </Text>
            <div className="flex flex-wrap gap-2">
              {(districts.data ?? []).map((district) => {
                const selected = form.districts.includes(district.slug);
                return (
                  <Button
                    key={district.slug}
                    type="button"
                    size="sm"
                    variant={selected ? 'primary' : 'outline'}
                    aria-pressed={selected}
                    onClick={() => {
                      toggleDistrict(district.slug);
                    }}
                  >
                    {district.name[locale]}
                  </Button>
                );
              })}
            </div>
          </fieldset>
        </Card>

        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="submit"
            isLoading={recommendations.isPending}
            loadingLabel={t('common:loading')}
          >
            {t('picks:form.submit')}
          </Button>
          {recommendations.isError && (
            <Text size="sm" tone="danger" role="alert">
              {t('picks:form.failed')}
            </Text>
          )}
        </div>
      </form>

      {data !== undefined && (
        <section className="flex flex-col gap-4" aria-live="polite">
          <Text tone="muted">
            {t('picks:results.count', {
              count: data.items.length,
              candidates: data.candidateCount,
            })}
          </Text>
          {data.omittedCriteria.length > 0 && (
            <Text size="sm" tone="muted">
              {t('picks:results.omitted', {
                criteria: data.omittedCriteria
                  .map((criterion) => t(`picks:criterion.${criterion}`))
                  .join(', '),
              })}
            </Text>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.items.map((item) => (
              <PickCard
                key={item.listing.id}
                item={item}
                to={`/${locale}/listings/${item.listing.publicId}`}
                onInteract={(type) => {
                  interact(item, type);
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
