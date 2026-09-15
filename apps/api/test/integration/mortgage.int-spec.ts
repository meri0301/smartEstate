/**
 * The refund against the rule sets that are actually seeded.
 *
 * The unit tests state what this project believes the law to be; this one checks
 * that the rows in the database say the same thing, that the right row is picked
 * by the agreement date, and that the two facts the whole design exists for hold
 * end to end: a Yerevan mortgage signed today refunds nothing, and the same
 * mortgage in Gyumri does not.
 */
import type { MortgageRefund, MortgageRefundRequestInput } from '@smartestate/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './setup/test-app.js';

describe('mortgage refund', () => {
  let app: TestApp;

  const refund = async (body: MortgageRefundRequestInput): Promise<MortgageRefund> => {
    const response = await app.request('POST', '/api/mortgage/refund', { body });
    expect(response.statusCode).toBe(200);
    return response.json<MortgageRefund>();
  };

  const base: MortgageRefundRequestInput = {
    propertyValueAmd: 40_000_000,
    loanAmountAmd: 32_000_000,
    annualRatePct: 11,
    termYears: 20,
    agreementDate: '2026-03-01',
    districtSlug: 'gyumri',
    purchaseKind: 'FROM_DEVELOPER',
    quarterlyIncomeTaxAmd: 900_000,
  };

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refunds a Gyumri mortgage signed today', async () => {
    const result = await refund(base);

    expect(result.eligible).toBe(true);
    expect(result.quarterlyRefund).toBeGreaterThan(0);
    expect(result.totalRefundOverTerm).toBeGreaterThan(0);
  });

  it('refunds nothing on the same mortgage in Yerevan, and says why', async () => {
    // The fact that made the seed need towns outside Yerevan at all.
    const result = await refund({ ...base, districtSlug: 'kentron' });

    expect(result.eligible).toBe(false);
    expect(result.quarterlyRefund).toBe(0);
    expect(result.ineligibilityReasons.map((reason) => reason.code)).toEqual(['PHASED_OUT']);
    expect(result.ineligibilityReasons[0]?.params).toMatchObject({
      marz: 'YEREVAN',
      phaseOutDate: '2025-01-01',
    });
  });

  it('still says what a Yerevan buyer would have received', async () => {
    const result = await refund({ ...base, districtSlug: 'kentron' });

    expect(result.forgoneQuarterlyRefund).toBeGreaterThan(0);
  });

  it('applies the 2025 cap to an agreement signed after it', async () => {
    const result = await refund({ ...base, quarterlyIncomeTaxAmd: 9_000_000 });

    expect(result.ruleSetVersion).toBe(2);
    // The seeded cap for version 2. Interest in the first quarter on this loan
    // is above it, so the cap is what binds.
    expect(result.quarterlyRefund).toBe(750_000);
  });

  it('applies the older cap to an agreement signed before 2025', async () => {
    const result = await refund({
      ...base,
      agreementDate: '2024-06-01',
      loanAmountAmd: 55_000_000,
      propertyValueAmd: 55_000_000,
      quarterlyIncomeTaxAmd: 9_000_000,
    });

    expect(result.ruleSetVersion).toBe(1);
    expect(result.quarterlyRefund).toBe(1_500_000);
  });

  it('lets a pre-2025 Yerevan agreement qualify, because the cut-off is the agreement date', async () => {
    const result = await refund({
      ...base,
      districtSlug: 'kentron',
      agreementDate: '2024-12-31',
    });

    expect(result.eligible).toBe(true);
    expect(result.ruleSetVersion).toBe(1);
  });

  it('refuses a property above the seeded ceiling', async () => {
    const result = await refund({ ...base, propertyValueAmd: 60_000_000 });

    expect(result.ineligibilityReasons.map((reason) => reason.code)).toContain(
      'PROPERTY_TOO_EXPENSIVE',
    );
    expect(
      result.ineligibilityReasons.find((r) => r.code === 'PROPERTY_TOO_EXPENSIVE')?.params,
    ).toEqual({ maxPropertyValueAmd: 55_000_000 });
  });

  it('gives Vanadzor and Dilijan the same answer as Gyumri, on their own phase-out dates', async () => {
    for (const districtSlug of ['vanadzor', 'dilijan']) {
      const now = await refund({ ...base, districtSlug });
      const after2029 = await refund({ ...base, districtSlug, agreementDate: '2029-06-01' });

      expect(now.eligible).toBe(true);
      expect(after2029.eligible).toBe(false);
      expect(after2029.ineligibilityReasons.map((reason) => reason.code)).toEqual(['PHASED_OUT']);
    }
  });

  it('returns every reason as a translatable key rather than a sentence', async () => {
    const result = await refund({
      ...base,
      districtSlug: 'kentron',
      propertyValueAmd: 90_000_000,
      purchaseKind: 'RESALE',
    });

    expect(result.ineligibilityReasons.length).toBeGreaterThan(1);
    for (const reason of result.ineligibilityReasons) {
      expect(reason.messageKey).toMatch(/^mortgage:ineligible\./);
    }
  });

  it('costs the same to borrow whether or not the refund applies', async () => {
    const eligible = await refund(base);
    const not = await refund({ ...base, districtSlug: 'kentron' });

    expect(not.monthlyPaymentAmd).toBe(eligible.monthlyPaymentAmd);
    expect(not.totalInterestAmd).toBe(eligible.totalInterestAmd);
  });

  it('publishes a year-by-year schedule that adds up to the total', async () => {
    const result = await refund(base);

    // Exactly, not approximately: a reader who adds the column up gets the
    // number printed beside it.
    const refunded = result.schedule.reduce((sum, year) => sum + year.refundAmd, 0);
    const interest = result.schedule.reduce((sum, year) => sum + year.interestAmd, 0);
    expect(refunded).toBe(result.totalRefundOverTerm);
    expect(interest).toBe(result.totalInterestAmd);
    expect(result.schedule).toHaveLength(20);
  });

  it('404s for a district nobody has heard of', async () => {
    const response = await app.request('POST', '/api/mortgage/refund', {
      body: { ...base, districtSlug: 'atlantis' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a request it cannot act on', async () => {
    const response = await app.request('POST', '/api/mortgage/refund', {
      body: { ...base, annualRatePct: 0 },
    });

    expect(response.statusCode).toBe(400);
  });
});
