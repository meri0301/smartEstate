/**
 * The arithmetic behind a standalone valuation.
 *
 * Everything here is a pure function of numbers the model or the catalogue
 * produced. Neither measure below is a probability and neither is a judgement
 * about the property: one describes the model's interval, the other describes
 * how much of the catalogue stands near it. Keeping them here, rather than
 * inside the service, is what lets them be tested against worked examples.
 */
import type { EvidenceLevel } from '@smartestate/contracts';

/**
 * Comparable counts at which the evidence stops being thin, then becomes strong.
 *
 * Round numbers, chosen rather than derived: there is no threshold in the data
 * at which an estimate becomes trustworthy, and pretending otherwise would be
 * worse than saying plainly where the line was drawn. What matters is that a
 * reader is told when the catalogue holds almost nothing like their property,
 * because that is when a confident-looking figure misleads most.
 */
export const MODERATE_EVIDENCE_AT = 8;
export const STRONG_EVIDENCE_AT = 25;

/** Twelve months of rent over the asking price, as a percentage. */
export function grossRentalYieldPct(monthlyRentAmd: number, askingPriceAmd: number): number {
  return ((monthlyRentAmd * 12) / askingPriceAmd) * 100;
}

/**
 * How tight the model's range is, from 0 to 1.
 *
 * `1 − (upper − lower) / estimate`. A range of ±10% around the estimate scores
 * 0.8; a range as wide as the estimate itself scores 0. It measures the interval
 * and nothing else: a wide range on a well-understood property and a wide range
 * on an unusual one score the same, which is why the comparable count is
 * reported beside it rather than folded into it.
 */
export function confidenceOf(input: {
  fairPriceAmd: number;
  lowerBoundAmd: number;
  upperBoundAmd: number;
}): number {
  if (input.fairPriceAmd <= 0) {
    return 0;
  }
  const width = (input.upperBoundAmd - input.lowerBoundAmd) / input.fairPriceAmd;
  return Math.min(1, Math.max(0, 1 - width));
}

/** Which band a comparable count falls in. */
export function evidenceOf(comparableCount: number): EvidenceLevel {
  if (comparableCount >= STRONG_EVIDENCE_AT) {
    return 'STRONG';
  }
  return comparableCount >= MODERATE_EVIDENCE_AT ? 'MODERATE' : 'THIN';
}
