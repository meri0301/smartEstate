import { PURCHASE_KINDS, type MortgageRefundRequestInput } from '@smartestate/contracts';
import { useState, type JSX, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useDistricts } from '../../geo/index.js';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { Button, Card, Input, Select, Text } from '../../../shared/ui/index.js';
import { useMortgageRefund } from '../api/use-mortgage-refund.js';
import { RefundResult } from './RefundResult.js';

export interface MortgageCalculatorProps {
  /** Prefilled when the reader arrived from a listing. */
  initialPropertyValueAmd?: number;
  initialDistrictSlug?: string;
}

/** A sensible starting point, so the form answers something before it is touched. */
const DEFAULTS = {
  propertyValueAmd: 40_000_000,
  loanAmountAmd: 32_000_000,
  annualRatePct: 11,
  termYears: 20,
  quarterlyIncomeTaxAmd: 450_000,
};

/**
 * The refund calculator.
 *
 * Deliberately a form and a button rather than a live recalculation: the answer
 * depends on seven numbers, and one that flickers while a seven-digit price is
 * typed is harder to read than one that waits to be asked.
 */
export function MortgageCalculator({
  initialPropertyValueAmd,
  initialDistrictSlug,
}: MortgageCalculatorProps): JSX.Element {
  const { t } = useTranslation(['mortgage', 'common']);
  const locale = useCurrentLocale();
  const districts = useDistricts();
  const refund = useMortgageRefund();

  const [form, setForm] = useState({
    propertyValueAmd: initialPropertyValueAmd ?? DEFAULTS.propertyValueAmd,
    loanAmountAmd: Math.round((initialPropertyValueAmd ?? DEFAULTS.propertyValueAmd) * 0.8),
    annualRatePct: DEFAULTS.annualRatePct,
    termYears: DEFAULTS.termYears,
    // Today, because a buyer is asking about the mortgage they would sign now,
    // and today is what decides whether the scheme still runs where they are.
    agreementDate: new Date().toISOString().slice(0, 10),
    districtSlug: initialDistrictSlug ?? '',
    purchaseKind: 'FROM_DEVELOPER' as MortgageRefundRequestInput['purchaseKind'],
    quarterlyIncomeTaxAmd: DEFAULTS.quarterlyIncomeTaxAmd,
    lenderIsResident: true,
    paysArmenianIncomeTax: true,
  });

  const options = (districts.data ?? []).map((district) => ({
    value: district.slug,
    label: district.name[locale],
  }));
  const districtSlug = form.districtSlug === '' ? (options[0]?.value ?? '') : form.districtSlug;

  const numberField =
    (key: keyof typeof form) =>
    (event: { target: { value: string } }): void => {
      const value = Number(event.target.value);
      setForm((current) => ({ ...current, [key]: Number.isFinite(value) ? value : 0 }));
    };

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    refund.mutate({ ...form, districtSlug });
  };

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={submit} className="flex flex-col gap-6">
        <Card tone="muted" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            type="number"
            label={t('mortgage:form.propertyValue')}
            value={String(form.propertyValueAmd)}
            onChange={numberField('propertyValueAmd')}
          />
          <Input
            type="number"
            label={t('mortgage:form.loanAmount')}
            value={String(form.loanAmountAmd)}
            onChange={numberField('loanAmountAmd')}
          />
          <Input
            type="number"
            step="0.1"
            label={t('mortgage:form.annualRate')}
            value={String(form.annualRatePct)}
            onChange={numberField('annualRatePct')}
          />
          <Input
            type="number"
            label={t('mortgage:form.termYears')}
            value={String(form.termYears)}
            onChange={numberField('termYears')}
          />
          <Input
            type="date"
            label={t('mortgage:form.agreementDate')}
            value={form.agreementDate}
            onChange={(event) => {
              setForm((current) => ({ ...current, agreementDate: event.target.value }));
            }}
          />
          <Select
            label={t('mortgage:form.district')}
            value={districtSlug}
            options={options}
            onChange={(event) => {
              setForm((current) => ({ ...current, districtSlug: event.target.value }));
            }}
          />
          <Select
            label={t('mortgage:form.purchaseKind')}
            value={form.purchaseKind}
            options={PURCHASE_KINDS.map((kind) => ({
              value: kind,
              label: t(`mortgage:purchaseKind.${kind}`),
            }))}
            onChange={(event) => {
              setForm((current) => ({
                ...current,
                purchaseKind: event.target.value as typeof current.purchaseKind,
              }));
            }}
          />
          <Input
            type="number"
            label={t('mortgage:form.quarterlyIncomeTax')}
            hint={t('mortgage:form.quarterlyIncomeTaxHint')}
            value={String(form.quarterlyIncomeTaxAmd)}
            onChange={numberField('quarterlyIncomeTaxAmd')}
          />
          <Checkbox
            label={t('mortgage:form.lenderIsResident')}
            checked={form.lenderIsResident}
            onChange={(checked) => {
              setForm((current) => ({ ...current, lenderIsResident: checked }));
            }}
          />
          <Checkbox
            label={t('mortgage:form.paysArmenianIncomeTax')}
            checked={form.paysArmenianIncomeTax}
            onChange={(checked) => {
              setForm((current) => ({ ...current, paysArmenianIncomeTax: checked }));
            }}
          />
        </Card>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" isLoading={refund.isPending} loadingLabel={t('common:loading')}>
            {t('mortgage:form.submit')}
          </Button>
          {refund.isError && (
            <Text size="sm" tone="danger" role="alert">
              {t('mortgage:form.failed')}
            </Text>
          )}
        </div>
      </form>

      {refund.data !== undefined && (
        <RefundResult
          refund={refund.data}
          annualRatePct={form.annualRatePct}
          termYears={form.termYears}
        />
      )}
    </div>
  );
}

/** A labelled checkbox; the design system has inputs and selects but no box. */
function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <label className="flex items-center gap-3 self-end pb-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="size-4 rounded-sm border border-border-interactive accent-accent"
      />
      <Text size="sm">{label}</Text>
    </label>
  );
}
