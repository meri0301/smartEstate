/**
 * The rules, as they arrive from the database.
 *
 * Every figure in this file's schema is read from a row, never written here.
 * That is the whole point of the design: the scheme phases out province by
 * province between now and 2029, the quarterly cap already halved once, and a
 * calculation quoted last year has to stay reproducible after the next change.
 * Constants in code would make each of those a deployment, and would make the
 * old answers unrecoverable.
 *
 * The rows are JSON, so they are validated on the way in exactly like a request
 * body. A rule set that does not parse is a configuration error worth failing
 * loudly for: quietly falling back to a default would be inventing tax law.
 */
import { z } from 'zod';

/**
 * The provinces, in the shape the phase-out map is keyed by.
 *
 * Mirrors the `Marz` enum in the schema rather than importing it, because this
 * validates untrusted JSON and a generated enum would let an unknown province
 * through as a plain string.
 */
export const MARZES = [
  'YEREVAN',
  'ARAGATSOTN',
  'ARARAT',
  'ARMAVIR',
  'GEGHARKUNIK',
  'KOTAYK',
  'LORI',
  'SHIRAK',
  'SYUNIK',
  'TAVUSH',
  'VAYOTS_DZOR',
] as const;
export const marzSchema = z.enum(MARZES);
export type Marz = z.infer<typeof marzSchema>;

export const refundRulesSchema = z.object({
  /** No agreement before this date qualifies, whatever else is true of it. */
  minAgreementDate: z.iso.date(),
  /** The most a property may be worth. A rule parameter, not a constant. */
  maxPropertyValueAmd: z.number().positive(),
  /** The most that can be refunded in one quarter. */
  quarterlyCapAmd: z.number().positive(),
  /**
   * An age limit, when the rules name one.
   *
   * Null in every seeded set, and null means "not a condition" rather than
   * "unknown". An age limit for this scheme is reported anecdotally and this
   * project has no source for it; inventing one would deny the refund to people
   * entitled to it, which is the worse of the two errors.
   */
  maxApplicantAge: z.number().int().positive().nullable(),
  /** Whether designated border settlements are exempt from the phase-out. */
  borderSettlementsExempt: z.boolean(),
  /**
   * The date the scheme ends for each province.
   *
   * A loan agreement signed on or after that date earns nothing there. Held as
   * a map rather than separate rows so that one rule set is one complete,
   * self-consistent statement of the law at a point in time.
   *
   * Every province is required, deliberately. An omitted one would mean "never
   * phases out", so a forgotten key would quietly grant a refund forever — which
   * is precisely the silent failure this whole design exists to prevent. A
   * province with no end date yet would carry a far-future one, stated.
   */
  phaseOut: z.record(marzSchema, z.iso.date()),
});
export type RefundRules = z.infer<typeof refundRulesSchema>;

/** One versioned rule set: the rules, and when they applied. */
export interface RuleSet {
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  description: string;
  rules: RefundRules;
}

/** Thrown when a stored rule set does not parse. Never recovered from silently. */
export class InvalidRuleSetError extends Error {
  constructor(version: number, detail: string) {
    super(`Tax refund rule set ${String(version)} is not usable: ${detail}`);
  }
}

/** Validates one stored row, or refuses it. */
export function parseRules(version: number, raw: unknown): RefundRules {
  const parsed = refundRulesSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidRuleSetError(
      version,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  return parsed.data;
}

/**
 * The rule set in force on a given date.
 *
 * Selected by the **agreement date**, not by today: which cap applies is a
 * property of the loan, so a mortgage signed in 2024 keeps its 1,500,000 ֏ cap
 * for its whole life and a calculation of it made in 2030 says the same thing it
 * said in 2024.
 */
export function ruleSetFor(sets: readonly RuleSet[], agreementDate: Date): RuleSet | undefined {
  return sets.find(
    (set) =>
      set.effectiveFrom.getTime() <= agreementDate.getTime() &&
      (set.effectiveTo === null || agreementDate.getTime() <= set.effectiveTo.getTime()),
  );
}
