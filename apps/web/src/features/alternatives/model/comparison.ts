/**
 * Turning the API's per-alternative comparisons into one table.
 *
 * The server compares every alternative against the subject, one pair at a time.
 * A table wants the transposition of that: one row per criterion, one column per
 * listing, and a mark on whichever column wins the row.
 *
 * The winner is computed here rather than sent, and that is not a loosening of
 * the rule that numbers come from the server. Every value in the table is a
 * number the server produced; picking the largest of them is presentation, and
 * doing it on the server would mean a second definition of "better" to keep in
 * step with the first.
 */
import type {
  AlternativeListing,
  ComparisonCriterion,
  CriterionComparison,
  ListingSummary,
} from '@smartestate/contracts';

/** Criteria where a smaller number is the better one. */
const LOWER_IS_BETTER: ReadonlySet<ComparisonCriterion> = new Set<ComparisonCriterion>([
  'price',
  'location',
  'value',
]);

/** How many listings a table can hold before it stops being readable. */
export const MAX_COMPARED = 4;

export interface ComparisonCell {
  value: number;
  unit: CriterionComparison['unit'];
  /** True for the best value in this row. Several cells can win a row together. */
  isBest: boolean;
}

export interface ComparisonRow {
  criterion: ComparisonCriterion;
  /** The subject first, then each alternative, in the order they were given. */
  cells: ComparisonCell[];
}

export interface ComparisonTable {
  /** Column headings: the subject, then the alternatives being compared. */
  listings: ListingSummary[];
  rows: ComparisonRow[];
}

/**
 * Builds the table for the subject and a chosen few alternatives.
 *
 * Every alternative was compared against the same subject on the same criteria,
 * so the subject's value for a criterion is read from whichever comparison
 * mentions it first — they all agree, and asserting that here rather than
 * trusting it would be checking the server's arithmetic on every render.
 */
export function buildComparison(
  subject: ListingSummary,
  criteria: readonly ComparisonCriterion[],
  chosen: readonly AlternativeListing[],
): ComparisonTable {
  const listings = [subject, ...chosen.slice(0, MAX_COMPARED - 1).map((entry) => entry.listing)];
  const selected = chosen.slice(0, MAX_COMPARED - 1);

  const rows: ComparisonRow[] = [];
  for (const criterion of criteria) {
    const values: (ComparisonCell | undefined)[] = [];
    const first = selected
      .flatMap((entry) => entry.comparisons)
      .find((comparison) => comparison.criterion === criterion);
    if (first === undefined) {
      continue;
    }
    values.push({ value: first.subject, unit: first.unit, isBest: false });

    for (const alternative of selected) {
      const comparison = alternative.comparisons.find((entry) => entry.criterion === criterion);
      values.push(
        comparison === undefined
          ? undefined
          : { value: comparison.alternative, unit: comparison.unit, isBest: false },
      );
    }

    // A criterion one of the columns has no value for cannot be won, so the row
    // is dropped rather than shown with a hole in it.
    if (values.some((cell) => cell === undefined)) {
      continue;
    }
    const cells = values as ComparisonCell[];
    rows.push({ criterion, cells: markBest(criterion, cells) });
  }

  return { listings, rows };
}

/**
 * Marks every cell that ties for best.
 *
 * Ties are marked rather than broken because the alternative is arbitrarily
 * picking one of two equal numbers and calling it the winner, which would read
 * as a difference where there is none.
 */
export function markBest(
  criterion: ComparisonCriterion,
  cells: readonly ComparisonCell[],
): ComparisonCell[] {
  const values = cells.map((cell) => cell.value);
  const best = LOWER_IS_BETTER.has(criterion) ? Math.min(...values) : Math.max(...values);
  return cells.map((cell) => ({ ...cell, isBest: cell.value === best }));
}
