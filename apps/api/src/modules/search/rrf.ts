/**
 * Reciprocal rank fusion — combining two rankings that do not share a scale.
 *
 * The lexical arm scores with `ts_rank`, whose numbers are small, unbounded
 * above and meaningful only relative to the same query. The semantic arm scores
 * with cosine similarity, which on this encoder lands almost everything between
 * 0.75 and 0.95: measured on real listing text, a paragraph about a quiet flat
 * near a school and one about a noisy street next to nightclubs were 0.84 and
 * 0.82 against the same query. The gap that matters is a fiftieth of the range.
 *
 * Adding or averaging those two numbers would be arithmetic on incomparable
 * units, and normalising them per query would let one arm's spread decide the
 * result. Reciprocal rank fusion (Cormack, Clarke and Buettcher, SIGIR 2009)
 * avoids both by throwing the scores away and keeping only the order:
 *
 *     score(d) = Σ over arms of 1 / (k + rank(d))
 *
 * A document that both arms put near the top wins. A document only one arm knows
 * about can still place well, which is the point of running two. And the
 * compressed cosine range stops mattering, because rank 1 is rank 1 whether it
 * won by 0.10 or by 0.001.
 */

/**
 * The constant that decides how much a top place is worth.
 *
 * At k = 60 — the value from the original paper, and the one every later
 * comparison uses as the baseline — first place scores 1/61 and eleventh scores
 * 1/71, a difference of about 14%. Smaller k makes the top few dominate and
 * effectively turns fusion into "whatever the better arm said"; larger k
 * flattens the ranking until agreement between the arms is all that is left.
 * It is kept as a named constant because the thesis reports results at this
 * value and a changed k changes every number in that table.
 */
export const RRF_K = 60;

/** One arm's opinion: an ordered list of listing ids, best first. */
export interface RankedArm {
  name: string;
  listingIds: readonly string[];
}

/** Where one listing placed, and why it is where it is. */
export interface FusedResult {
  listingId: string;
  score: number;
  /** Rank in each arm that found it, 1-based. An arm that missed it is absent. */
  ranks: Record<string, number>;
}

/**
 * Fuse any number of ranked lists into one.
 *
 * Ties are broken by the best single rank achieved, then by id, so the order is
 * total and stable: two runs over the same data return the same list, which is
 * a precondition for comparing strategies at all.
 */
export function fuse(arms: readonly RankedArm[], k: number = RRF_K): FusedResult[] {
  const byListing = new Map<string, FusedResult>();

  for (const arm of arms) {
    arm.listingIds.forEach((listingId, index) => {
      const rank = index + 1;
      const existing = byListing.get(listingId) ?? { listingId, score: 0, ranks: {} };
      // A duplicate id inside one arm would count twice and inflate the score.
      if (existing.ranks[arm.name] !== undefined) {
        return;
      }
      existing.ranks[arm.name] = rank;
      existing.score += 1 / (k + rank);
      byListing.set(listingId, existing);
    });
  }

  return [...byListing.values()].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const bestA = Math.min(...Object.values(a.ranks));
    const bestB = Math.min(...Object.values(b.ranks));
    if (bestA !== bestB) {
      return bestA - bestB;
    }
    return a.listingId.localeCompare(b.listingId);
  });
}
