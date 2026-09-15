/**
 * The mortgage income-tax refund.
 *
 * Armenia lets a buyer reclaim the personal income tax they pay, up to the
 * mortgage interest they pay, up to a cap, each quarter. It is a real and
 * locally specific benefit, it is being phased out province by province between
 * now and 2029, and almost nobody can tell you what they are entitled to.
 *
 * Three things shape this contract.
 *
 * **Nothing is a bare number.** The answer is a structure: whether the buyer
 * qualifies, and if not, exactly which conditions failed. "You get nothing" is
 * useless; "you get nothing because the loan would be signed after Yerevan's
 * phase-out date, and it would have been 750,000 ֏ a quarter" is something a
 * person can act on — by looking outside Yerevan, or by nothing at all, but
 * knowingly.
 *
 * **Reasons are keys, not sentences.** The server decides *what* is wrong and
 * the client decides how to say it, in one of three languages. An English string
 * crossing this boundary would be untranslatable by the time anyone noticed.
 *
 * **Every answer names the rules that produced it.** `ruleSetVersion` is the row
 * that was in force on the agreement date, so a figure quoted today can be
 * reproduced after the law changes.
 */
import { z } from 'zod';
import { amdAmountSchema, isoDateTimeSchema } from './common/primitives.js';

/** Why a buyer does not qualify. Every code has a message in every locale. */
export const INELIGIBILITY_CODES = [
  /** The agreement predates the scheme. */
  'AGREEMENT_TOO_EARLY',
  /** The scheme has ended for this province, or would have by the agreement date. */
  'PHASED_OUT',
  /** The property is worth more than the rules allow. */
  'PROPERTY_TOO_EXPENSIVE',
  /** Not bought from a developer, the state or the community, nor self-built. */
  'NOT_ELIGIBLE_PURCHASE',
  /** The lender is not a resident Armenian financial institution. */
  'LENDER_NOT_RESIDENT',
  /** The applicant does not pay Armenian personal income tax. */
  'NOT_AN_ARMENIAN_TAXPAYER',
  /** Older than the rules allow, when the rules name a limit at all. */
  'APPLICANT_TOO_OLD',
  /** No rule set covers the agreement date. */
  'NO_RULES_FOR_DATE',
] as const;
export const ineligibilityCodeSchema = z.enum(INELIGIBILITY_CODES);
export type IneligibilityCode = z.infer<typeof ineligibilityCodeSchema>;

export const ineligibilityReasonSchema = z.object({
  code: ineligibilityCodeSchema,
  /** The i18n key the client renders. Never an English sentence. */
  messageKey: z.string(),
  /** Values the message interpolates: a date, a cap, a province. */
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type IneligibilityReason = z.infer<typeof ineligibilityReasonSchema>;

/** How the property was acquired. Only some routes qualify. */
export const PURCHASE_KINDS = [
  /** Newly built, bought directly from the developer. */
  'FROM_DEVELOPER',
  /** Bought from the state or the community. */
  'FROM_STATE_OR_COMMUNITY',
  /** Built by the applicant under a valid permit. */
  'SELF_BUILT',
  /** Anything else, including a resale between private individuals. */
  'RESALE',
] as const;
export const purchaseKindSchema = z.enum(PURCHASE_KINDS);
export type PurchaseKind = z.infer<typeof purchaseKindSchema>;

export const mortgageRefundRequestSchema = z.object({
  /** The property price the loan is against. */
  propertyValueAmd: amdAmountSchema,
  /** How much is borrowed. */
  loanAmountAmd: amdAmountSchema,
  /** Nominal annual interest rate, as a percentage. */
  annualRatePct: z.number().min(0.1).max(30),
  termYears: z.number().int().min(1).max(30),
  /** Date the loan agreement is signed. Decides the rules and the phase-out. */
  agreementDate: z.iso.date(),
  /** Where the property is. The phase-out is by province. */
  districtSlug: z.string().min(1).max(64),
  purchaseKind: purchaseKindSchema,
  /** A resident Armenian financial institution is a condition of the scheme. */
  lenderIsResident: z.boolean().default(true),
  /** Paying Armenian personal income tax is another. */
  paysArmenianIncomeTax: z.boolean().default(true),
  /**
   * Income tax actually paid in a quarter. The refund is capped by it, so
   * without it the answer would be the interest and not the refund.
   *
   * Either this or `monthlyIncomeAmd` is required. Giving the tax directly is
   * always exact; deriving it from income needs a rate this project will not
   * assume.
   */
  quarterlyIncomeTaxAmd: amdAmountSchema.optional(),
  /** Gross monthly income, from which the tax is derived when a rate is configured. */
  monthlyIncomeAmd: amdAmountSchema.optional(),
  /** Only used when the rules in force name an age limit. */
  applicantAge: z.number().int().min(18).max(100).optional(),
});
export type MortgageRefundRequest = z.infer<typeof mortgageRefundRequestSchema>;
export type MortgageRefundRequestInput = z.input<typeof mortgageRefundRequestSchema>;

/** One year of the loan, so the decline in the refund is visible rather than asserted. */
export const refundYearSchema = z.object({
  /** 1 for the first year of the loan. */
  year: z.number().int().min(1),
  interestAmd: z.number().min(0),
  refundAmd: z.number().min(0),
  /** True when the cap, rather than the interest or the tax, decided the refund. */
  cappedInAnyQuarter: z.boolean(),
});
export type RefundYear = z.infer<typeof refundYearSchema>;

export const mortgageRefundSchema = z.object({
  eligible: z.boolean(),
  /** Empty when eligible. Every entry is a condition that failed. */
  ineligibilityReasons: z.array(ineligibilityReasonSchema),

  /** The refund in the first full quarter, when the interest is at its highest. */
  quarterlyRefund: z.number().min(0),
  /** Every quarter of the term added up. */
  totalRefundOverTerm: z.number().min(0),
  /**
   * The nominal rate that would cost the same over the term without a refund.
   *
   * The number a buyer actually wants: not "you get 12 million back" but "your
   * 11% mortgage behaves like a 9.2% one".
   */
  effectiveInterestRate: z.number().min(0),

  /** What the loan costs before any refund, for context. */
  monthlyPaymentAmd: z.number().min(0),
  totalInterestAmd: z.number().min(0),
  /** Year by year, so a reader can see the refund shrink as the interest does. */
  schedule: z.array(refundYearSchema),

  /**
   * What a buyer would have received had they qualified.
   *
   * Present even when ineligible, because "you would have had 750,000 ֏ a
   * quarter" is the difference between a rejection and an explanation.
   */
  forgoneQuarterlyRefund: z.number().min(0).optional(),

  /** The rule set row that produced this, so the answer stays reproducible. */
  ruleSetVersion: z.number().int().optional(),
  calculatedAt: isoDateTimeSchema,
});
export type MortgageRefund = z.infer<typeof mortgageRefundSchema>;
