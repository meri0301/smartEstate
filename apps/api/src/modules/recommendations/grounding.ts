/**
 * Checking that a generated paragraph contains no number it was not given.
 *
 * The brief's first guardrail is that no model output is ever trusted as fact
 * and that every number a user sees comes from the database or the model
 * service. A prompt that says "use only these figures" is a request. This is the
 * part that makes it a rule: after the model answers, every number in its
 * paragraph is matched against the figures it was handed, and a paragraph
 * containing one that is not accounted for is discarded in favour of the
 * computed reasons.
 *
 * What it catches: invented prices, invented areas, invented distances,
 * percentages that drifted while being rephrased, and the confident arithmetic
 * that small models do when asked to summarise numbers.
 *
 * What it cannot catch, and the prompt and review have to: a fact asserted in
 * words rather than digits. "Three bathrooms" passes a check that only reads
 * digits. That is the honest limit of a cheap, deterministic test, and it is
 * still worth having, because the numbers are where a wrong answer does damage.
 */

/**
 * One written number, with the separators the three locales put inside one.
 *
 * A separator only counts as grouping when three digits follow it, which is what
 * stops "built in 1975, 8 floors" from being read as the single number 19758.
 * Anything not grouped that way falls through to the plain form, where a
 * separator can only be a decimal point. `\s` covers the non-breaking and thin
 * spaces that Armenian and Russian number formatting uses.
 */
const NUMBER_RUN = /\d{1,3}(?:[\s'.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/gu;

/** Grouping marks, once a run has been split from the text around it. */
const GROUPING = /[\s']/gu;

/**
 * Relative tolerance when matching a quoted number to a given one.
 *
 * Half a per cent, because a model rephrasing "20.4% under budget" as "about
 * 20%" has not invented anything, and rejecting that would make the check fire
 * constantly on correct paragraphs.
 */
const RELATIVE_TOLERANCE = 0.005;

/**
 * Scales a quoted number may be written at.
 *
 * "45 million dram" is 45 in the text and 45,000,000 in the figures, and both
 * spellings are honest. Thousands are here for distances written as "1.2 km"
 * against 1,200 metres.
 */
const SCALES = [1, 1_000, 1_000_000] as const;

/** One way of reading a written number, and how precisely it was written. */
export interface Reading {
  value: number;
  /** Digits after the decimal separator, which is what its precision is. */
  decimals: number;
}

/**
 * Every number in the text that cannot be traced to one of the given figures.
 *
 * An empty result means the paragraph is grounded. Anything else is a reason to
 * throw the paragraph away, and is worth logging: a model that keeps inventing
 * the same figure is saying something about the prompt.
 */
export function ungroundedNumbers(text: string, figures: readonly number[]): string[] {
  // Sign lives in the wording — "12% below the estimate" for a figure of -12 —
  // so only magnitudes are compared.
  const allowed = figures.map((figure) => Math.abs(figure));
  const ungrounded: string[] = [];

  for (const match of text.matchAll(NUMBER_RUN)) {
    const token = match[0];
    const readings = interpretations(token);
    // No reading at all means the run was punctuation-heavy enough to be
    // unparseable, which is not the same as invented; leave it alone.
    if (readings.length > 0 && !readings.some((reading) => isGrounded(reading, allowed))) {
      ungrounded.push(token.trim());
    }
  }
  return ungrounded;
}

/**
 * Every value a written number could plausibly mean.
 *
 * The three locales disagree about separators — 45,000,000 and 45 000 000 and
 * 45.000.000 are the same amount, and 45,5 and 45.5 are the same measurement —
 * and the paragraph does not say which convention it is using. Rather than guess
 * one and be wrong, every reading is produced and the number is grounded if any
 * of them is. Being generous here costs nothing: an invented figure is invented
 * under all of its readings.
 */
export function interpretations(token: string): Reading[] {
  const cleaned = token.replace(GROUPING, '');
  if (cleaned === '') {
    return [];
  }
  const readings = new Map<number, Reading>();
  const add = (value: number, decimals: number): void => {
    if (Number.isFinite(value) && !readings.has(value)) {
      readings.set(value, { value, decimals });
    }
  };

  // Everything that is not a digit treated as grouping: "45.000.000" → 45000000.
  add(Number(cleaned.replace(/[.,]/gu, '')), 0);

  // The last separator treated as a decimal point: "45,5" → 45.5.
  const lastSeparator = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  if (lastSeparator > 0 && lastSeparator < cleaned.length - 1) {
    const whole = cleaned.slice(0, lastSeparator).replace(/[.,]/gu, '');
    const fraction = cleaned.slice(lastSeparator + 1);
    add(Number(`${whole}.${fraction}`), fraction.length);
  }

  return [...readings.values()];
}

/**
 * Whether one reading of a written number accounts for one of the figures.
 *
 * The tolerance is half a unit of the last digit actually written, scaled with
 * the reading: "45 million" claims the price to the nearest million and is
 * satisfied by 45,000,000, while "45.5 million" claims it to the nearest hundred
 * thousand and is not. That is what makes rounding acceptable and drift not.
 */
function isGrounded(reading: Reading, allowed: readonly number[]): boolean {
  const magnitude = Math.abs(reading.value);
  return SCALES.some((scale) => {
    const written = magnitude * scale;
    const precision = 0.5 * scale * 10 ** -reading.decimals;
    return allowed.some(
      (figure) => Math.abs(written - figure) <= Math.max(precision, figure * RELATIVE_TOLERANCE),
    );
  });
}
