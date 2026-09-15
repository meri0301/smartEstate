/**
 * Working out what a buyer gets back, and why they do not.
 *
 * Pure: rules in, answer out, no database and no clock beyond the one the caller
 * passes. Everything that decides the result is an argument, which is what lets
 * the eligibility rules be tested one at a time instead of through a fixture
 * that happens to trip several at once.
 *
 * The rule the whole feature turns on, per quarter:
 *
 *     refund = MIN(interest paid, income tax paid, quarterly cap)
 *
 * with no carry-over. Interest that exceeds the cap in one quarter is simply
 * lost; it does not roll into the next. That is why the answer needs a schedule
 * rather than a total — early quarters are capped and late ones are limited by
 * the interest, and averaging the two gives a number that is never right.
 */
import type {
  IneligibilityReason,
  MortgageRefund,
  MortgageRefundRequest,
  RefundYear,
} from '@smartestate/contracts';
import {
  amortise,
  monthlyPayment,
  quarterlyInterest,
  rateForTotalInterest,
} from './amortisation.js';
import type { Marz, RefundRules, RuleSet } from './refund-rules.js';

/** Where the property is, as the calculation needs it. */
export interface PropertyLocation {
  districtSlug: string;
  marz: Marz;
  /** Designated border settlements are exempt from the phase-out. */
  isBorderSettlement: boolean;
}

export interface CalculationInput {
  request: MortgageRefundRequest;
  location: PropertyLocation;
  ruleSet: RuleSet | undefined;
  /**
   * Personal income tax rate, as a percentage, when one is configured.
   *
   * Undefined is a supported state and not an oversight: this project has no
   * authoritative source for the current rate, so it is read from configuration
   * and left unset by default. Without it, income tax has to be given directly
   * and a request that supplies only a salary is answered with the interest cap
   * alone — see `quarterlyTax`.
   */
  incomeTaxRatePct?: number | undefined;
  now: Date;
}

/** Message keys live under one namespace so the client needs no lookup table. */
const KEY = 'mortgage:ineligible';

export function calculateRefund(input: CalculationInput): MortgageRefund {
  const { request, location, ruleSet, now } = input;

  const loan = {
    principalAmd: request.loanAmountAmd,
    annualRatePct: request.annualRatePct,
    termYears: request.termYears,
  };
  const schedule = amortise(loan);
  // Rounded once, here, at the quarter — which is where a refund is actually
  // claimed and paid, and the dram has no subunit. Everything above this line is
  // exact arithmetic on whole numbers, so the yearly column a reader adds up
  // comes to exactly the total beside it. Rounding the total separately put the
  // two a dram apart over twenty years, which is precisely the kind of detail
  // that makes somebody stop trusting the rest of the page.
  const interestByQuarter = quarterlyInterest(schedule).map((value) => Math.round(value));
  const interestTotal = interestByQuarter.reduce((sum, value) => sum + value, 0);

  const reasons =
    ruleSet === undefined
      ? [
          {
            code: 'NO_RULES_FOR_DATE' as const,
            messageKey: `${KEY}.noRulesForDate`,
            params: { agreementDate: request.agreementDate },
          },
        ]
      : ineligibilityReasons(request, location, ruleSet.rules);

  // Computed whatever the verdict, because "you would have had 750,000 ֏ a
  // quarter" is the difference between a rejection and an explanation.
  const cap = ruleSet?.rules.quarterlyCapAmd;
  const tax = quarterlyTax(request, input.incomeTaxRatePct);
  const refunds =
    cap === undefined
      ? interestByQuarter.map(() => 0)
      : interestByQuarter.map((interest) => Math.round(Math.min(interest, tax ?? interest, cap)));

  const eligible = reasons.length === 0;
  const totalRefund = eligible ? refunds.reduce((sum, value) => sum + value, 0) : 0;

  return {
    eligible,
    ineligibilityReasons: reasons,
    quarterlyRefund: eligible ? (refunds[0] ?? 0) : 0,
    totalRefundOverTerm: totalRefund,
    // The rate that would cost the same over the term without a refund.
    effectiveInterestRate: round(
      rateForTotalInterest(interestTotal - totalRefund, loan.principalAmd, loan.termYears),
      2,
    ),
    monthlyPaymentAmd: round(monthlyPayment(loan)),
    totalInterestAmd: interestTotal,
    schedule: yearly(interestByQuarter, refunds, eligible, cap),
    ...(eligible ? {} : { forgoneQuarterlyRefund: refunds[0] ?? 0 }),
    ...(ruleSet === undefined ? {} : { ruleSetVersion: ruleSet.version }),
    calculatedAt: now.toISOString(),
  };
}

/**
 * Income tax paid in a quarter, or `undefined` when it cannot be known.
 *
 * Given directly, it is used. Derived from a salary, it needs a rate, and this
 * project will not assume one — an invented rate would produce a confident
 * figure that is wrong by however much the guess was wrong, which is worse than
 * no figure. Without either, the refund falls back to the interest and the cap,
 * which over-states it; the response says a rate was not applied by leaving the
 * tax out of the calculation rather than by pretending to a precision it has not
 * got.
 */
export function quarterlyTax(
  request: MortgageRefundRequest,
  incomeTaxRatePct: number | undefined,
): number | undefined {
  if (request.quarterlyIncomeTaxAmd !== undefined) {
    return request.quarterlyIncomeTaxAmd;
  }
  if (request.monthlyIncomeAmd === undefined || incomeTaxRatePct === undefined) {
    return undefined;
  }
  return ((request.monthlyIncomeAmd * incomeTaxRatePct) / 100) * 3;
}

/**
 * Every condition that fails, not the first one.
 *
 * A buyer who fixes one problem and is told about the next has been made to
 * discover their ineligibility twice. All of them, once.
 */
export function ineligibilityReasons(
  request: MortgageRefundRequest,
  location: PropertyLocation,
  rules: RefundRules,
): IneligibilityReason[] {
  const reasons: IneligibilityReason[] = [];
  const agreement = new Date(`${request.agreementDate}T00:00:00Z`);

  if (agreement.getTime() < new Date(`${rules.minAgreementDate}T00:00:00Z`).getTime()) {
    reasons.push({
      code: 'AGREEMENT_TOO_EARLY',
      messageKey: `${KEY}.agreementTooEarly`,
      params: { minAgreementDate: rules.minAgreementDate },
    });
  }

  // A designated border settlement keeps the scheme after its province loses it.
  // Every province has a date: the rules schema requires the map to be total, so
  // there is no missing-key case to guard against here.
  const phaseOutDate = rules.phaseOut[location.marz];
  const exempt = rules.borderSettlementsExempt && location.isBorderSettlement;
  if (!exempt && agreement.getTime() >= new Date(`${phaseOutDate}T00:00:00Z`).getTime()) {
    reasons.push({
      code: 'PHASED_OUT',
      messageKey: `${KEY}.phasedOut`,
      params: { marz: location.marz, phaseOutDate },
    });
  }

  if (request.propertyValueAmd > rules.maxPropertyValueAmd) {
    reasons.push({
      code: 'PROPERTY_TOO_EXPENSIVE',
      messageKey: `${KEY}.propertyTooExpensive`,
      params: { maxPropertyValueAmd: rules.maxPropertyValueAmd },
    });
  }

  if (request.purchaseKind === 'RESALE') {
    reasons.push({
      code: 'NOT_ELIGIBLE_PURCHASE',
      messageKey: `${KEY}.notEligiblePurchase`,
      params: {},
    });
  }

  if (!request.lenderIsResident) {
    reasons.push({
      code: 'LENDER_NOT_RESIDENT',
      messageKey: `${KEY}.lenderNotResident`,
      params: {},
    });
  }

  if (!request.paysArmenianIncomeTax) {
    reasons.push({
      code: 'NOT_AN_ARMENIAN_TAXPAYER',
      messageKey: `${KEY}.notAnArmenianTaxpayer`,
      params: {},
    });
  }

  // Only checked when the rules in force actually name a limit. Null means the
  // condition does not exist, not that the limit is unknown.
  if (
    rules.maxApplicantAge !== null &&
    request.applicantAge !== undefined &&
    request.applicantAge > rules.maxApplicantAge
  ) {
    reasons.push({
      code: 'APPLICANT_TOO_OLD',
      messageKey: `${KEY}.applicantTooOld`,
      params: { maxApplicantAge: rules.maxApplicantAge },
    });
  }

  return reasons;
}

/** Quarters folded into years, with a flag where the cap did the limiting. */
function yearly(
  interestByQuarter: readonly number[],
  refunds: readonly number[],
  eligible: boolean,
  cap: number | undefined,
): RefundYear[] {
  const years: RefundYear[] = [];
  for (let start = 0; start < interestByQuarter.length; start += 4) {
    const quarters = interestByQuarter.slice(start, start + 4);
    const refunded = refunds.slice(start, start + 4);
    years.push({
      year: start / 4 + 1,
      interestAmd: quarters.reduce((sum, value) => sum + value, 0),
      refundAmd: eligible ? refunded.reduce((sum, value) => sum + value, 0) : 0,
      cappedInAnyQuarter:
        eligible && cap !== undefined && refunded.some((value) => Math.abs(value - cap) < 1),
    });
  }
  return years;
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
