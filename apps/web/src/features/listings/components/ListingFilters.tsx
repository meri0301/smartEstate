import {
  BUILDING_TYPES,
  CONDITIONS,
  type BuildingType,
  type Condition,
  type District,
} from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { Button, Heading, Input } from '../../../shared/ui/index.js';
import { activeFilterCount, EMPTY_FILTERS, type ListingFilterValues } from '../model/filters.js';

export interface ListingFiltersProps {
  values: ListingFilterValues;
  districts: readonly District[];
  onChange: (next: ListingFilterValues) => void;
}

/**
 * The filter panel.
 *
 * Every control writes straight through to the parent, which puts the result in
 * the URL: there is no local draft and no Apply button, so the address bar and
 * the results can never disagree. Numeric fields are `inputMode="numeric"` text
 * rather than `type="number"`, because a number input silently discards what it
 * cannot parse and offers a spinner nobody wants on a price in dram.
 */
export function ListingFilters({ values, districts, onChange }: ListingFiltersProps): JSX.Element {
  const { t } = useTranslation('listings');
  const locale = useCurrentLocale();
  const count = activeFilterCount(values);

  const set = <K extends keyof ListingFilterValues>(
    key: K,
    value: ListingFilterValues[K],
  ): void => {
    onChange({ ...values, [key]: value });
  };

  const setNumber =
    (key: 'priceMin' | 'priceMax' | 'roomsMin' | 'roomsMax' | 'areaMin' | 'areaMax' | 'yearMin') =>
    (raw: string): void => {
      const parsed = Number(raw);
      set(key, raw.trim() === '' || !Number.isFinite(parsed) || parsed <= 0 ? undefined : parsed);
    };

  const toggleIn = <T extends string>(list: readonly T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <form
      className="flex flex-col gap-6"
      aria-label={t('search.filtersLabel')}
      onSubmit={(event) => {
        // Submitting has nothing to do: every change is already applied.
        event.preventDefault();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <Heading as="h2" size="sm" transform="none">
          {t('search.filters')}
        </Heading>
        {count > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({ ...EMPTY_FILTERS, sort: values.sort });
            }}
          >
            {t('search.clear', { count })}
          </Button>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-body text-sm font-medium text-text">
          {t('filters.price')}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('filters.priceMin')}
            inputMode="numeric"
            value={values.priceMin?.toString() ?? ''}
            onChange={(event) => {
              setNumber('priceMin')(event.target.value);
            }}
          />
          <Input
            label={t('filters.priceMax')}
            inputMode="numeric"
            value={values.priceMax?.toString() ?? ''}
            onChange={(event) => {
              setNumber('priceMax')(event.target.value);
            }}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-body text-sm font-medium text-text">
          {t('filters.rooms')}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('filters.roomsMin')}
            inputMode="numeric"
            value={values.roomsMin?.toString() ?? ''}
            onChange={(event) => {
              setNumber('roomsMin')(event.target.value);
            }}
          />
          <Input
            label={t('filters.roomsMax')}
            inputMode="numeric"
            value={values.roomsMax?.toString() ?? ''}
            onChange={(event) => {
              setNumber('roomsMax')(event.target.value);
            }}
          />
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('filters.areaMin')}
          inputMode="decimal"
          value={values.areaMin?.toString() ?? ''}
          onChange={(event) => {
            setNumber('areaMin')(event.target.value);
          }}
        />
        <Input
          label={t('filters.areaMax')}
          inputMode="decimal"
          value={values.areaMax?.toString() ?? ''}
          onChange={(event) => {
            setNumber('areaMax')(event.target.value);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('filters.yearMin')}
          inputMode="numeric"
          value={values.yearMin?.toString() ?? ''}
          onChange={(event) => {
            setNumber('yearMin')(event.target.value);
          }}
        />
      </div>

      <CheckboxGroup
        legend={t('filters.districts')}
        items={districts.map((district) => ({
          value: district.slug,
          label: district.name[locale],
        }))}
        selected={values.districts}
        onToggle={(value) => {
          set('districts', toggleIn(values.districts, value));
        }}
      />

      <CheckboxGroup
        legend={t('filters.buildingType')}
        items={BUILDING_TYPES.map((type) => ({ value: type, label: t(`buildingType.${type}`) }))}
        selected={values.buildingTypes}
        onToggle={(value) => {
          set('buildingTypes', toggleIn(values.buildingTypes, value as BuildingType));
        }}
      />

      <CheckboxGroup
        legend={t('filters.condition')}
        items={CONDITIONS.map((condition) => ({
          value: condition,
          label: t(`condition.${condition}`),
        }))}
        selected={values.conditions}
        onToggle={(value) => {
          set('conditions', toggleIn(values.conditions, value as Condition));
        }}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-body text-sm font-medium text-text">
          {t('filters.features')}
        </legend>
        <Switch
          label={t('filters.hasElevator')}
          checked={values.hasElevator}
          onToggle={() => {
            set('hasElevator', !values.hasElevator);
          }}
        />
        <Switch
          label={t('filters.hasParking')}
          checked={values.hasParking}
          onToggle={() => {
            set('hasParking', !values.hasParking);
          }}
        />
        <Switch
          label={t('filters.docsVerified')}
          checked={values.docsVerified}
          onToggle={() => {
            set('docsVerified', !values.docsVerified);
          }}
        />
        <Switch
          label={t('filters.excludeGroundFloor')}
          checked={values.excludeGroundFloor}
          onToggle={() => {
            set('excludeGroundFloor', !values.excludeGroundFloor);
          }}
        />
        <Switch
          label={t('filters.excludeTopFloor')}
          checked={values.excludeTopFloor}
          onToggle={() => {
            set('excludeTopFloor', !values.excludeTopFloor);
          }}
        />
      </fieldset>
    </form>
  );
}

interface CheckboxGroupProps {
  legend: string;
  items: readonly { value: string; label: string }[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}

function CheckboxGroup({ legend, items, selected, onToggle }: CheckboxGroupProps): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-body text-sm font-medium text-text">{legend}</legend>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <Switch
            key={item.value}
            label={item.label}
            checked={selected.includes(item.value)}
            onToggle={() => {
              onToggle(item.value);
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}

interface SwitchProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
}

/** A plain checkbox: the native control brings its own keyboard and announcement behaviour. */
function Switch({ label, checked, onToggle }: SwitchProps): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center gap-3 font-body text-sm text-text-secondary">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-4 accent-[var(--se-color-accent)]"
      />
      {label}
    </label>
  );
}
