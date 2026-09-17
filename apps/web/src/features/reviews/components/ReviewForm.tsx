import {
  REVIEWER_ROLES,
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  REVIEW_NAME_MAX,
  type CreateReviewRequest,
} from '@smartestate/contracts';
import { useState, type JSX, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatNumber } from '../../../shared/i18n/formatters.js';
import { Button, Card, Heading, Input, Select, Text, Textarea } from '../../../shared/ui/index.js';

export interface ReviewFormProps {
  onSubmit: (request: CreateReviewRequest) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error?: string;
}

/**
 * Writing a review.
 *
 * Two facts about this form are unusual enough that the form says them rather
 * than leaving a reader to discover them: what they write appears on the page
 * immediately, and the name they type is published as given and verified by
 * nobody. Both follow from the product decision to keep the form open, and a
 * person deciding what to sign should know them before they type, not after.
 *
 * The locale is taken from the page rather than asked, because it is not a
 * choice — it is the language they are already writing in, and the interface
 * uses it to mark the quote.
 */
export function ReviewForm({
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: ReviewFormProps): JSX.Element {
  const { t } = useTranslation('home');
  const locale = useCurrentLocale();
  const [authorName, setAuthorName] = useState('');
  const [authorRole, setAuthorRole] = useState<CreateReviewRequest['authorRole']>('HOMEBUYER');
  const [body, setBody] = useState('');

  const remaining = REVIEW_BODY_MAX - body.length;

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    onSubmit({ authorName: authorName.trim(), authorRole, body: body.trim(), locale });
  };

  return (
    <Card as="section" tone="outline" padding="lg" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Heading as="h3" size="sm" transform="none">
          {t('reviews.write.title')}
        </Heading>
        <Text size="sm" tone="muted">
          {t('reviews.write.intro')}
        </Text>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t('reviews.write.name')}
            placeholder={t('reviews.write.namePlaceholder')}
            value={authorName}
            maxLength={REVIEW_NAME_MAX}
            minLength={2}
            onChange={(event) => {
              setAuthorName(event.target.value);
            }}
            required
          />
          <Select
            label={t('reviews.write.role')}
            options={REVIEWER_ROLES.map((role) => ({
              value: role,
              label: t(`reviews.role.${role}`),
            }))}
            value={authorRole}
            onChange={(event) => {
              setAuthorRole(event.target.value as CreateReviewRequest['authorRole']);
            }}
          />
        </div>

        <Textarea
          label={t('reviews.write.body')}
          placeholder={t('reviews.write.bodyPlaceholder')}
          hint={t('reviews.write.bodyHint', { min: REVIEW_BODY_MIN, max: REVIEW_BODY_MAX })}
          rows={4}
          value={body}
          minLength={REVIEW_BODY_MIN}
          maxLength={REVIEW_BODY_MAX}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          required
        />

        <Text size="xs" tone="muted" aria-live="polite">
          {t('reviews.write.remaining', { count: formatNumber(remaining, locale) })}
        </Text>

        <Text size="xs" tone="muted">
          {t('reviews.write.notice')}
        </Text>

        {error !== undefined && (
          <Text size="sm" tone="danger">
            {error}
          </Text>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            isLoading={isSubmitting}
            loadingLabel={t('reviews.write.submitting')}
          >
            {t('reviews.write.submit')}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('reviews.write.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
