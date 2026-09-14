import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button, Heading, Text } from '../../shared/ui/index.js';

export function NotFoundPage(): JSX.Element {
  const { t } = useTranslation(['errors', 'common']);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-start gap-4">
      <Heading as="h1" size="lg">
        {t('errors:notFound')}
      </Heading>
      <Text>{t('errors:notFoundHint')}</Text>
      <Button
        variant="outline"
        onClick={() => {
          // Relative navigation keeps the locale segment that is already in the URL.
          void navigate('');
        }}
      >
        {t('common:brand')}
      </Button>
    </div>
  );
}
