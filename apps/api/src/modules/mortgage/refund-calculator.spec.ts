/**
 * The eligibility rules and the quarterly cap, one condition at a time.
 *
 * These assertions are the closest thing this project has to a statement of what
 * it believes the law to be, so each one names the condition it is about rather
 * than exercising several at once through a fixture.
 */
import type { MortgageRefundRequest } from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import {
  calculateRefund,
  ineligibilityReasons,
  quarterlyTax,
  type PropertyLocation,
} from './refund-calculator.js';
import { parseRules, type RuleSet } from './refund-rules.js';

const RULES_2024 = parseRules(1, {
  minAgreementDate: '2014-11-01',
  maxPropertyValueAmd: 55_000_000,
  quarterlyCapAmd: 1_500_000,
  maxApplicantAge: null,
  borderSettlementsExempt: true,
  // Every province, because the schema requires every province — a missing key
  // would mean "never phases out".
  phaseOut: {
    YEREVAN: '2025-01-01',
    ARAGATSOTN: '2027-01-01',
    ARARAT: '2027-01-01',
    ARMAVIR: '2027-01-01',
    KOTAYK: '2027-01-01',
    SHIRAK: '2029-01-01',
    LORI: '2029-01-01',
    TAVUSH: '2029-01-01',
    GEGHARKUNIK: '2029-01-01',
    VAYOTS_DZOR: '2029-01-01',
    SYUNIK: '2029-01-01',
  },
});

const RULES_2025 = parseRules(2, { ...RULES_2024, quarterlyCapAmd: 750_000 });

const setOf = (version: number, from: string, to: string | null, rules = RULES_2024): RuleSet => ({
  version,
  effectiveFrom: new Date(`${from}T00:00:00Z`),
  effectiveTo: to === null ? null : new Date(`${to}T00:00:00Z`),
  description: 'test',
  rules,
});

const request = (overrides: Partial<MortgageRefundRequest> = {}): MortgageRefundRequest => ({
  propertyValueAmd: 40_000_000,
  loanAmountAmd: 32_000_000,
  annualRatePct: 11,
  termYears: 20,
  agreementDate: '2026-03-01',
  districtSlug: 'gyumri',
  purchaseKind: 'FROM_DEVELOPER',
  lenderIsResident: true,
  paysArmenianIncomeTax: true,
  quarterlyIncomeTaxAmd: 600_000,
  ...overrides,
});

const gyumri: PropertyLocation = {
  districtSlug: 'gyumri',
  marz: 'SHIRAK',
  isBorderSettlement: false,
};
const yerevan: PropertyLocation = {
  districtSlug: 'kentron',
  marz: 'YEREVAN',
  isBorderSettlement: false,
};

const NOW = new Date('2026-09-15T00:00:00Z');
const SET_2024 = setOf(1, '2014-11-01', '2024-12-31', RULES_2024);
const SET_2025 = setOf(2, '2025-01-01', null, RULES_2025);

/**
 * Every argument is named, and `ruleSet` is spelled out at every call.
 *
 * A positional parameter with a default cannot express "deliberately none":
 * passing `undefined` silently selects the default, which is how the
 * no-rules-for-this-date case first appeared to pass while testing nothing.
 */
const calculate = (options: {
  request?: Partial<MortgageRefundRequest>;
  location?: PropertyLocation;
  ruleSet: RuleSet | undefined;
  incomeTaxRatePct?: number;
}) =>
  calculateRefund({
    request: request(options.request ?? {}),
    location: options.location ?? gyumri,
    ruleSet: options.ruleSet,
    ...(options.incomeTaxRatePct === undefined
      ? {}
      : { incomeTaxRatePct: options.incomeTaxRatePct }),
    now: NOW,
  });

describe('eligibility', () => {
  it('accepts a loan that meets every condition', () => {
    const result = calculate({ ruleSet: SET_2025 });

    expect(result.eligible).toBe(true);
    expect(result.ineligibilityReasons).toEqual([]);
  });

  it('refuses an agreement signed before the scheme began', () => {
    const reasons = ineligibilityReasons(
      request({ agreementDate: '2014-10-31' }),
      gyumri,
      RULES_2024,
    );

    expect(reasons.map((reason) => reason.code)).toContain('AGREEMENT_TOO_EARLY');
  });

  it('refuses a Yerevan loan signed on the day the scheme ended there', () => {
    // The boundary is the point of the rule: on or after, not after.
    const reasons = ineligibilityReasons(
      request({ agreementDate: '2025-01-01' }),
      yerevan,
      RULES_2025,
    );

    expect(reasons.map((reason) => reason.code)).toContain('PHASED_OUT');
  });

  it('allows a Yerevan loan signed the day before', () => {
    const reasons = ineligibilityReasons(
      request({ agreementDate: '2024-12-31' }),
      yerevan,
      RULES_2024,
    );

    expect(reasons).toEqual([]);
  });

  it('keeps the scheme for a designated border settlement after its province loses it', () => {
    const border = { ...yerevan, isBorderSettlement: true };

    const reasons = ineligibilityReasons(
      request({ agreementDate: '2026-01-01' }),
      border,
      RULES_2025,
    );

    expect(reasons).toEqual([]);
  });

  it('phases out the provinces on their own dates, not on one date', () => {
    const inShirak = ineligibilityReasons(
      request({ agreementDate: '2028-01-01' }),
      gyumri,
      RULES_2025,
    );
    const inYerevan = ineligibilityReasons(
      request({ agreementDate: '2028-01-01' }),
      yerevan,
      RULES_2025,
    );

    expect(inShirak).toEqual([]);
    expect(inYerevan.map((reason) => reason.code)).toEqual(['PHASED_OUT']);
  });

  it('refuses a property above the value the rules allow', () => {
    const reasons = ineligibilityReasons(
      request({ propertyValueAmd: 55_000_001 }),
      gyumri,
      RULES_2025,
    );

    expect(reasons.map((reason) => reason.code)).toEqual(['PROPERTY_TOO_EXPENSIVE']);
    expect(reasons[0]?.params).toEqual({ maxPropertyValueAmd: 55_000_000 });
  });

  it('accepts a property at exactly the limit', () => {
    expect(
      ineligibilityReasons(request({ propertyValueAmd: 55_000_000 }), gyumri, RULES_2025),
    ).toEqual([]);
  });

  it('refuses a resale between private individuals', () => {
    const reasons = ineligibilityReasons(request({ purchaseKind: 'RESALE' }), gyumri, RULES_2025);

    expect(reasons.map((reason) => reason.code)).toEqual(['NOT_ELIGIBLE_PURCHASE']);
  });

  it.each(['FROM_DEVELOPER', 'FROM_STATE_OR_COMMUNITY', 'SELF_BUILT'] as const)(
    'accepts a %s purchase',
    (purchaseKind) => {
      expect(ineligibilityReasons(request({ purchaseKind }), gyumri, RULES_2025)).toEqual([]);
    },
  );

  it('refuses a loan from a lender that is not resident', () => {
    const reasons = ineligibilityReasons(request({ lenderIsResident: false }), gyumri, RULES_2025);

    expect(reasons.map((reason) => reason.code)).toEqual(['LENDER_NOT_RESIDENT']);
  });

  it('refuses somebody who pays no Armenian income tax', () => {
    const reasons = ineligibilityReasons(
      request({ paysArmenianIncomeTax: false }),
      gyumri,
      RULES_2025,
    );

    expect(reasons.map((reason) => reason.code)).toEqual(['NOT_AN_ARMENIAN_TAXPAYER']);
  });

  it('ignores age when the rules name no limit', () => {
    // Null means the condition does not exist, not that the limit is unknown.
    expect(ineligibilityReasons(request({ applicantAge: 70 }), gyumri, RULES_2025)).toEqual([]);
  });

  it('applies an age limit when a rule set does name one', () => {
    const withLimit = parseRules(3, { ...RULES_2025, maxApplicantAge: 45 });

    expect(
      ineligibilityReasons(request({ applicantAge: 46 }), gyumri, withLimit).map((r) => r.code),
    ).toEqual(['APPLICANT_TOO_OLD']);
    expect(ineligibilityReasons(request({ applicantAge: 45 }), gyumri, withLimit)).toEqual([]);
  });

  it('reports every failed condition, not the first', () => {
    // Fixing one and being told about the next means discovering the bad news
    // twice.
    const reasons = ineligibilityReasons(
      request({
        propertyValueAmd: 90_000_000,
        purchaseKind: 'RESALE',
        lenderIsResident: false,
        paysArmenianIncomeTax: false,
      }),
      gyumri,
      RULES_2025,
    );

    expect(reasons.map((reason) => reason.code).sort()).toEqual([
      'LENDER_NOT_RESIDENT',
      'NOT_AN_ARMENIAN_TAXPAYER',
      'NOT_ELIGIBLE_PURCHASE',
      'PROPERTY_TOO_EXPENSIVE',
    ]);
  });

  it('gives every reason a message key and never an English sentence', () => {
    const reasons = ineligibilityReasons(request({ purchaseKind: 'RESALE' }), yerevan, RULES_2025);

    for (const reason of reasons) {
      expect(reason.messageKey).toMatch(/^mortgage:ineligible\./);
    }
  });
});

describe('the quarterly refund', () => {
  it('is the smallest of the interest, the tax and the cap', () => {
    // First quarter interest on 32M at 11% is about 880,000; the cap is 750,000.
    const capped = calculate({
      request: { quarterlyIncomeTaxAmd: 5_000_000 },
      ruleSet: SET_2025,
    });
    expect(capped.quarterlyRefund).toBe(750_000);

    // A smaller tax bill binds before the cap does.
    const taxBound = calculate({
      request: { quarterlyIncomeTaxAmd: 200_000 },
      ruleSet: SET_2025,
    });
    expect(taxBound.quarterlyRefund).toBe(200_000);
  });

  it('is limited by the interest late in the term, when little is left', () => {
    const result = calculate({
      request: { quarterlyIncomeTaxAmd: 5_000_000 },
      ruleSet: SET_2025,
    });
    const firstYear = result.schedule[0];
    const lastYear = result.schedule.at(-1);

    // By the final year the interest is far below the cap, so it is the interest
    // doing the limiting and the refund equals it.
    expect(lastYear?.refundAmd).toBe(lastYear?.interestAmd);
    expect(lastYear?.cappedInAnyQuarter).toBe(false);
    expect(firstYear?.cappedInAnyQuarter).toBe(true);
  });

  it('does not carry unused interest into the next quarter', () => {
    // Capped quarters lose the excess; the total is the sum of capped quarters
    // and never more than the cap times the number of quarters.
    const result = calculate({
      request: { quarterlyIncomeTaxAmd: 50_000_000 },
      ruleSet: SET_2025,
    });

    expect(result.totalRefundOverTerm).toBeLessThanOrEqual(750_000 * 20 * 4);
    expect(result.totalRefundOverTerm).toBeLessThan(result.totalInterestAmd);
  });

  it('halves when the 2025 cap applies instead of the 2024 one', () => {
    // A loan big enough that both caps bind: 55M at 11% is about 1,512,500 of
    // interest in the first quarter, above the older cap as well as the newer.
    const big = {
      propertyValueAmd: 55_000_000,
      loanAmountAmd: 55_000_000,
      quarterlyIncomeTaxAmd: 5_000_000,
    };
    const before = calculate({
      request: { ...big, agreementDate: '2024-06-01' },
      ruleSet: SET_2024,
    });
    const after = calculate({ request: big, ruleSet: SET_2025 });

    expect(before.quarterlyRefund).toBe(1_500_000);
    expect(after.quarterlyRefund).toBe(750_000);
  });

  it('names the rule set that produced it', () => {
    expect(calculate({ ruleSet: SET_2025 }).ruleSetVersion).toBe(2);
  });

  it('expresses the refund as a lower effective rate', () => {
    const result = calculate({
      request: { quarterlyIncomeTaxAmd: 5_000_000 },
      ruleSet: SET_2025,
    });

    expect(result.effectiveInterestRate).toBeGreaterThan(0);
    expect(result.effectiveInterestRate).toBeLessThan(11);
  });
});

describe('when the buyer does not qualify', () => {
  it('refunds nothing', () => {
    const result = calculate({
      request: { agreementDate: '2026-03-01' },
      location: yerevan,
      ruleSet: SET_2025,
    });

    expect(result.eligible).toBe(false);
    expect(result.quarterlyRefund).toBe(0);
    expect(result.totalRefundOverTerm).toBe(0);
  });

  it('still says what the refund would have been', () => {
    // The difference between a rejection and an explanation. Here the buyer's
    // own tax bill of 600,000 binds before the 750,000 cap does, which is the
    // honest figure rather than the headline one.
    const result = calculate({
      request: { agreementDate: '2026-03-01' },
      location: yerevan,
      ruleSet: SET_2025,
    });

    expect(result.forgoneQuarterlyRefund).toBe(600_000);
  });

  it('still costs the same to borrow', () => {
    const eligible = calculate({ ruleSet: SET_2025 });
    const not = calculate({
      request: { agreementDate: '2026-03-01' },
      location: yerevan,
      ruleSet: SET_2025,
    });

    expect(not.monthlyPaymentAmd).toBe(eligible.monthlyPaymentAmd);
    expect(not.effectiveInterestRate).toBeCloseTo(11, 1);
  });

  it('says so when no rule set covers the date at all', () => {
    const result = calculate({ request: { agreementDate: '2010-01-01' }, ruleSet: undefined });

    expect(result.eligible).toBe(false);
    expect(result.ineligibilityReasons.map((reason) => reason.code)).toEqual(['NO_RULES_FOR_DATE']);
    expect(result.ruleSetVersion).toBeUndefined();
  });
});

describe('quarterlyTax', () => {
  it('uses the tax it was given', () => {
    expect(quarterlyTax(request({ quarterlyIncomeTaxAmd: 400_000 }), 20)).toBe(400_000);
  });

  it('derives it from a salary when a rate is configured', () => {
    const derived = quarterlyTax(
      request({ quarterlyIncomeTaxAmd: undefined, monthlyIncomeAmd: 500_000 }),
      20,
    );

    expect(derived).toBe(300_000);
  });

  it('refuses to derive it without a configured rate', () => {
    // Assuming a rate would produce a confident figure that is wrong by however
    // much the guess was wrong.
    expect(
      quarterlyTax(
        request({ quarterlyIncomeTaxAmd: undefined, monthlyIncomeAmd: 500_000 }),
        undefined,
      ),
    ).toBeUndefined();
  });

  it('is unknown when neither is given', () => {
    expect(quarterlyTax(request({ quarterlyIncomeTaxAmd: undefined }), 20)).toBeUndefined();
  });
});
