import { useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Heading, Skeleton, Text } from '../../../shared/ui/index.js';
import { reviewKeys, useCreateReview, useProductStats, useReviews } from '../api/use-reviews.js';
import { ReviewCarousel } from './ReviewCarousel.js';
import { ReviewForm } from './ReviewForm.js';

export const REVIEWS_ID = 'reviews';

const HEADING_ID = 'reviews-heading';

/**
 * What people say, and what the product has actually done.
 *
 * The design fills this with three quotations from named people who do not
 * exist, under a badge reading "10,000+ valuations completed". Neither could
 * ship: an invented endorsement attributed to a named individual is a lie about
 * a person, and the figure is contradicted by the database.
 *
 * So the quotations are real reviews, written through the form below by whoever
 * wants to write one, and the badges carry counts anybody can check. Until
 * somebody writes the first one the section says so, which is a truthful empty
 * state and a better invitation than a fabricated crowd.
 */
export function ReviewsSection(): JSX.Element {
  const { t } = useTranslation('home');
  const queryClient = useQueryClient();
  const reviews = useReviews();
  const stats = useProductStats();
  const create = useCreateReview();
  const [isWriting, setWriting] = useState(false);

  const justPublished = create.isSuccess && !isWriting;

  return (
    <section id={REVIEWS_ID} aria-labelledby={HEADING_ID} className="mt-16 scroll-mt-8 md:mt-20">
      <div className="flex max-w-2xl flex-col gap-2">
        <Heading as="h2" size="md" id={HEADING_ID}>
          {t('reviews.title')}
        </Heading>
        <Text tone="muted">{t('reviews.intro')}</Text>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {reviews.isPending && <Skeleton className="h-52 w-full" />}

        {reviews.isError && <Text tone="danger">{t('reviews.failed')}</Text>}

        {reviews.data !== undefined &&
          (reviews.data.items.length > 0 ? (
            <ReviewCarousel reviews={reviews.data.items} />
          ) : (
            <Text tone="muted">{t('reviews.empty')}</Text>
          ))}

        {justPublished && (
          <Text tone="success" role="status">
            {t('reviews.write.thanks')}
          </Text>
        )}

        {isWriting ? (
          <ReviewForm
            isSubmitting={create.isPending}
            error={create.isError ? t('reviews.write.failed') : undefined}
            onCancel={() => {
              setWriting(false);
              create.reset();
            }}
            onSubmit={(request) => {
              create.mutate(request, {
                onSuccess: () => {
                  setWriting(false);
                  void queryClient.invalidateQueries({ queryKey: reviewKeys.list });
                },
              });
            }}
          />
        ) : (
          <div>
            <Button
              variant="outline"
              onClick={() => {
                create.reset();
                setWriting(true);
              }}
            >
              {t('reviews.write.open')}
            </Button>
          </div>
        )}

        {/*
          The design's single badge, as two, because the honest figures are two
          different things: how big the catalogue is, and how much valuing has
          been done in it.
        */}
        {stats.data !== undefined && (
          <ul className="flex flex-wrap gap-3">
            <li>
              <Badge tone="accent">
                {t('reviews.stats.listings', { count: stats.data.listingsPublished })}
              </Badge>
            </li>
            <li>
              <Badge tone="neutral">
                {t('reviews.stats.valuations', { count: stats.data.valuationsCompleted })}
              </Badge>
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
