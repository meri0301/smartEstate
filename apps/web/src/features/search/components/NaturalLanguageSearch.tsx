import type { ParsedQuery } from '@smartestate/contracts';
import { useState, type JSX, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Text } from '../../../shared/ui/index.js';
import { useParseQuery } from '../api/use-parse-query.js';

export interface NaturalLanguageSearchProps {
  /** Called with the parse; the caller decides what to do with the filters. */
  onParsed: (parsed: ParsedQuery) => void;
}

/**
 * Search in a sentence.
 *
 * The box never searches by itself. It hands the parse to the page, which turns
 * it into the same filters a reader could have clicked, and those appear as
 * chips they can remove. That indirection is the whole design: the reader is
 * always looking at the filters that are actually applied, not at a promise
 * about what a sentence meant.
 *
 * Phrases the parser could not place are shown rather than swallowed. "Quiet"
 * and "near a school" are reasonable things to ask for and the system cannot act
 * on either yet; saying so is better than returning results that ignore them.
 */
export function NaturalLanguageSearch({ onParsed }: NaturalLanguageSearchProps): JSX.Element {
  const { t } = useTranslation(['listings', 'common']);
  const [text, setText] = useState('');
  const parse = useParseQuery();

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const query = text.trim();
    if (query.length === 0) {
      return;
    }
    parse.mutate(query, { onSuccess: onParsed });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label={t('listings:search.askLabel')}
          placeholder={t('listings:search.askPlaceholder')}
          hint={t('listings:search.askHint')}
          value={text}
          fieldClassName="min-w-64 flex-1"
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <Button
          type="submit"
          isLoading={parse.isPending}
          loadingLabel={t('common:loading')}
          className="mb-7"
        >
          {t('listings:search.askSubmit')}
        </Button>
      </div>

      {parse.isError && (
        <Text size="sm" tone="danger" role="alert">
          {t('listings:search.askFailed')}
        </Text>
      )}

      {parse.data !== undefined && parse.data.unmapped.length > 0 && (
        <Text size="sm" tone="muted">
          {t('listings:search.askUnmapped', {
            phrases: parse.data.unmapped.join(', '),
          })}
        </Text>
      )}
    </form>
  );
}
