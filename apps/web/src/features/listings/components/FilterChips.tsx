import type { District } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatAmd, formatNumber } from '../../../shared/i18n/formatters.js';
import { Text } from '../../../shared/ui/index.js';
import { toChips } from '../model/chips.js';
import type { ListingFilterValues } from '../model/filters.js';

export interface FilterChipsProps {
  values: ListingFilterValues;
  districts: readonly District[];
  onChange: (next: ListingFilterValues) => void;
}

/**
 * What is currently filtering the results, and a way to stop each one.
 *
 * Deliberately not labelled as "what the AI understood": these are the filters
 * in force, however they got there. A reader who clicked a district and a reader
 * who typed one see the same chip and remove it the same way.
 */
export function FilterChips({ values, districts, onChange }: FilterChipsProps): JSX.Element | null {
  const { t } = useTranslation('listings');
  const locale = useCurrentLocale();

  const chips = toChips(values, {
    // Chip keys are built from data (a district slug, a building type), so they
    // cannot be one of the statically known catalogue keys. The catalogue check
    // covers the fixed part of each key; this cast covers the join.
    t: (key, params) => t(key as never, params ?? {}),
    price: (amount) => formatAmd(amount, locale, { compact: true }),
    area: (value) => t('area', { area: formatNumber(value, locale, { maximumFractionDigits: 1 }) }),
    district: (slug) => districts.find((item) => item.slug === slug)?.name[locale] ?? slug,
  });

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Text as="span" size="sm" tone="muted">
        {t('chips.title')}
      </Text>
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chip.id}>
            <button
              type="button"
              onClick={() => {
                onChange(chip.remove());
              }}
              aria-label={t('chips.remove', { filter: chip.label })}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1 font-body text-sm text-text transition-colors duration-[var(--se-duration-fast)] ease-standard hover:border-border-interactive"
            >
              {chip.label}
              <svg viewBox="0 0 12 12" aria-hidden className="size-3 text-text-muted">
                <path
                  d="M2 2l8 8M10 2l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
