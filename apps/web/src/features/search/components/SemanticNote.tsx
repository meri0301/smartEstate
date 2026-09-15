import type { HybridSearchResponse } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '../../../shared/ui/index.js';

export interface SemanticNoteProps {
  result: HybridSearchResponse;
  /** Returns to the ordinary filtered list. */
  onClear: () => void;
}

/**
 * What the reader is looking at, and why it is ordered the way it is.
 *
 * A ranked list is a different thing from a filtered one and hiding that would
 * be dishonest: these results are sorted by how well they answer a sentence, the
 * sort control does not apply to them, and some of them were found by meaning
 * rather than by the words that were typed.
 *
 * When the semantic half did not run the note says so instead. A reader who gets
 * lexical-only results deserves to know that the part of their sentence the
 * filters could not express went unanswered — otherwise "quiet" silently
 * becomes nothing at all.
 */
export function SemanticNote({ result, onClear }: SemanticNoteProps): JSX.Element {
  const { t } = useTranslation(['listings', 'common']);
  const semantic = result.arms.includes('semantic');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-4 py-3">
      <div className="flex flex-col gap-1">
        <Text size="sm">
          {t('listings:search.rankedFor', { query: result.query, count: result.results.length })}
        </Text>
        {semantic && result.unmapped.length > 0 && (
          <Text size="sm" tone="muted">
            {t('listings:search.rankedByMeaning', { phrases: result.unmapped.join(', ') })}
          </Text>
        )}
        {!semantic && (
          <Text size="sm" tone="muted">
            {t(
              result.semanticSkipped === 'not-indexed'
                ? 'listings:search.semanticNotIndexed'
                : 'listings:search.semanticUnavailable',
            )}
          </Text>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onClear}>
        {t('listings:search.clearQuery')}
      </Button>
    </div>
  );
}
