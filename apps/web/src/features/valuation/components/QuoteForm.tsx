import {
  BUILDING_TYPES,
  CONDITIONS,
  HEATING_TYPES,
  type ValuationQuoteRequest,
} from '@smartestate/contracts';
import { useState, type JSX, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useDistricts } from '../../geo/index.js';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { Button, Input, Select, Text, Textarea } from '../../../shared/ui/index.js';

export interface QuoteFormProps {
  onSubmit: (request: ValuationQuoteRequest) => void;
  isSubmitting: boolean;
}

/**
 * A flat somewhere in the middle of the catalogue, for the "try an example"
 * link. It exists so the section can be demonstrated without a reader having to
 * invent eight plausible numbers first, and so the answer it produces is one
 * the seeded data can actually support.
 */
const EXAMPLE = {
  districtSlug: 'arabkir',
  rooms: '2',
  totalArea: '63',
  askingPriceAmd: '57000000',
  condition: 'GOOD',
  buildingType: 'STONE',
  constructionYear: '1961',
  heating: 'ELECTRIC',
  floor: '3',
  totalFloors: '4',
  hasElevator: 'false',
  hasParking: 'false',
  monthlyRentAmd: '300000',
  notes: '',
} as const;

type FormState = Record<keyof typeof EXAMPLE, string>;

const EMPTY: FormState = {
  districtSlug: '',
  rooms: '',
  totalArea: '',
  askingPriceAmd: '',
  condition: '',
  buildingType: '',
  constructionYear: '',
  heating: '',
  floor: '',
  totalFloors: '',
  hasElevator: '',
  hasParking: '',
  monthlyRentAmd: '',
  notes: '',
};

/**
 * The property details the model needs.
 *
 * Every field is held as a string, because an empty number input is not zero —
 * it is unanswered, and the difference matters here: a blank year of
 * construction is filled from the district and reported as an assumption, while
 * a zero would be a building raised before Rome.
 *
 * Only the fields the model cannot work without are required. The rest are
 * genuinely optional, and the verdict says what stood in for each blank rather
 * than quietly pretending the reader answered.
 */
export function QuoteForm({ onSubmit, isSubmitting }: QuoteFormProps): JSX.Element {
  const { t } = useTranslation(['valuation', 'listings']);
  const locale = useCurrentLocale();
  const districts = useDistricts();
  const [form, setForm] = useState<FormState>(EMPTY);

  const set =
    (key: keyof FormState) =>
    (event: { target: { value: string } }): void => {
      const { value } = event.target;
      setForm((current) => ({ ...current, [key]: value }));
    };

  const districtOptions = (districts.data ?? []).map((district) => ({
    value: district.slug,
    label: district.name[locale],
  }));

  const enumOptions = <T extends string>(values: readonly T[], group: string) =>
    values.map((value) => ({ value, label: t(`listings:${group}.${value}` as never) }));

  const yesNo = [
    { value: 'true', label: t('valuation:quote.form.yes') },
    { value: 'false', label: t('valuation:quote.form.no') },
  ];

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const optionalNumber = (value: string): number | undefined =>
      value.trim() === '' ? undefined : Number(value);
    const optionalFlag = (value: string): boolean | undefined =>
      value === '' ? undefined : value === 'true';

    onSubmit({
      districtSlug: form.districtSlug,
      rooms: Number(form.rooms),
      totalArea: Number(form.totalArea),
      floor: Number(form.floor),
      totalFloors: Number(form.totalFloors),
      buildingType: form.buildingType as ValuationQuoteRequest['buildingType'],
      condition: form.condition as ValuationQuoteRequest['condition'],
      askingPriceAmd: Number(form.askingPriceAmd),
      constructionYear: optionalNumber(form.constructionYear),
      heating: form.heating === '' ? undefined : (form.heating as ValuationQuoteRequest['heating']),
      hasElevator: optionalFlag(form.hasElevator),
      hasParking: optionalFlag(form.hasParking),
      monthlyRentAmd: optionalNumber(form.monthlyRentAmd),
      notes: form.notes.trim() === '' ? undefined : form.notes.trim(),
    });
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5 rounded-md border border-border p-6 md:p-8"
    >
      <Text size="sm" weight="medium" tone="strong">
        {t('valuation:quote.form.legend')}
      </Text>

      <Select
        label={t('valuation:quote.form.district')}
        placeholder={t('valuation:quote.form.districtPlaceholder')}
        options={districtOptions}
        value={form.districtSlug}
        onChange={set('districtSlug')}
        required
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label={t('valuation:quote.form.buildingType')}
          placeholder={t('valuation:quote.form.select')}
          options={enumOptions(BUILDING_TYPES, 'buildingType')}
          value={form.buildingType}
          onChange={set('buildingType')}
          required
        />
        <Select
          label={t('valuation:quote.form.rooms')}
          placeholder={t('valuation:quote.form.select')}
          options={[1, 2, 3, 4, 5, 6].map((count) => ({
            value: String(count),
            label: t('listings:roomCount', { count }),
          }))}
          value={form.rooms}
          onChange={set('rooms')}
          required
        />
        <Input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="6"
          label={t('valuation:quote.form.totalArea')}
          placeholder={t('valuation:quote.form.totalAreaPlaceholder')}
          value={form.totalArea}
          onChange={set('totalArea')}
          required
        />
        <Select
          label={t('valuation:quote.form.condition')}
          placeholder={t('valuation:quote.form.select')}
          options={enumOptions(CONDITIONS, 'condition')}
          value={form.condition}
          onChange={set('condition')}
          required
        />
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          label={t('valuation:quote.form.askingPrice')}
          placeholder={t('valuation:quote.form.askingPricePlaceholder')}
          value={form.askingPriceAmd}
          onChange={set('askingPriceAmd')}
          required
        />
        <Input
          type="number"
          inputMode="numeric"
          min="1850"
          max="2100"
          label={t('valuation:quote.form.constructionYear')}
          placeholder={t('valuation:quote.form.constructionYearPlaceholder')}
          value={form.constructionYear}
          onChange={set('constructionYear')}
        />
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          label={t('valuation:quote.form.floor')}
          placeholder={t('valuation:quote.form.floorPlaceholder')}
          value={form.floor}
          onChange={set('floor')}
          required
        />
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          label={t('valuation:quote.form.totalFloors')}
          placeholder={t('valuation:quote.form.totalFloorsPlaceholder')}
          value={form.totalFloors}
          onChange={set('totalFloors')}
          required
        />
        <Select
          label={t('valuation:quote.form.heating')}
          placeholder={t('valuation:quote.form.unknown')}
          options={enumOptions(HEATING_TYPES, 'heating')}
          value={form.heating}
          onChange={set('heating')}
        />
        <Select
          label={t('valuation:quote.form.elevator')}
          placeholder={t('valuation:quote.form.unknown')}
          options={yesNo}
          value={form.hasElevator}
          onChange={set('hasElevator')}
        />
        <Select
          label={t('valuation:quote.form.parking')}
          placeholder={t('valuation:quote.form.unknown')}
          options={yesNo}
          value={form.hasParking}
          onChange={set('hasParking')}
        />
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          label={t('valuation:quote.form.monthlyRent')}
          placeholder={t('valuation:quote.form.monthlyRentPlaceholder')}
          value={form.monthlyRentAmd}
          onChange={set('monthlyRentAmd')}
        />
      </div>

      <Textarea
        label={t('valuation:quote.form.notes')}
        placeholder={t('valuation:quote.form.notesPlaceholder')}
        hint={t('valuation:quote.form.notesHint')}
        rows={3}
        maxLength={1000}
        value={form.notes}
        onChange={set('notes')}
      />

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          isLoading={isSubmitting}
          loadingLabel={t('valuation:quote.form.submitting')}
        >
          {t('valuation:quote.form.submit')}
        </Button>
        <button
          type="button"
          className="font-body text-sm text-text-secondary underline underline-offset-4 hover:text-text"
          onClick={() => {
            setForm({ ...EXAMPLE });
          }}
        >
          {t('valuation:quote.form.example')}
        </button>
      </div>
    </form>
  );
}
