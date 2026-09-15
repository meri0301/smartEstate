/**
 * Turning a table of criterion scores into one ranking.
 *
 * Two methods, because they disagree in a way worth showing. A weighted sum
 * rewards a listing that is good at what the buyer weighted heavily, and will
 * happily rank one that is terrible at everything else. TOPSIS measures distance
 * from the best and worst listings actually available, so it favours the
 * all-round option and punishes a lopsided one. Neither is correct; a thesis
 * that reports both and says when they diverge is more useful than one that
 * picks a winner.
 *
 * Both are standard and citable: weighted sum is the simple additive weighting
 * of Fishburn (1967), TOPSIS is Hwang and Yoon (1981).
 */
import type { CriterionScore, McdaMethod, RankingCriterion } from '@smartestate/contracts';

/** Scores for one candidate. A criterion may be absent when nothing could be measured. */
export type CriterionScores = Readonly<Partial<Record<RankingCriterion, number | undefined>>>;

export interface ScoredCandidate<T> {
  candidate: T;
  score: number;
  breakdown: CriterionScore[];
}

/**
 * Weights that sum to one, over the criteria that can actually be scored.
 *
 * Dropping a criterion and renormalising is the honest response to a missing
 * measurement: the remaining criteria keep their relative importance, and the
 * total stays comparable with a run where nothing was missing. Filling the gap
 * with a default would quietly rank listings on a number nobody produced.
 */
export function normaliseWeights(
  weights: Readonly<Record<string, number>>,
  usable: readonly RankingCriterion[],
): Record<string, number> {
  const relevant = usable.filter((criterion) => (weights[criterion] ?? 0) > 0);
  const total = relevant.reduce((sum, criterion) => sum + (weights[criterion] ?? 0), 0);
  if (total <= 0) {
    // Nothing was weighted; treat every usable criterion as equally important
    // rather than returning a ranking in which every listing scores zero.
    const share = usable.length > 0 ? 1 / usable.length : 0;
    return Object.fromEntries(usable.map((criterion) => [criterion, share]));
  }
  return Object.fromEntries(
    relevant.map((criterion) => [criterion, (weights[criterion] ?? 0) / total]),
  );
}

/**
 * Criteria that every candidate can be scored on.
 *
 * A criterion missing for some candidates and not others would make their scores
 * incomparable, so one gap disqualifies it for the whole run.
 */
export function usableCriteria(
  rows: readonly CriterionScores[],
  all: readonly RankingCriterion[],
): RankingCriterion[] {
  return all.filter((criterion) =>
    rows.every((row) => typeof row[criterion] === 'number' && Number.isFinite(row[criterion])),
  );
}

function breakdownOf(
  scores: CriterionScores,
  weights: Readonly<Record<string, number>>,
): CriterionScore[] {
  return Object.entries(weights)
    .map(([criterion, weight]) => {
      const score = scores[criterion as RankingCriterion] ?? 0;
      return {
        criterion: criterion as RankingCriterion,
        score,
        weight,
        contribution: score * weight,
      };
    })
    .sort((a, b) => b.contribution - a.contribution);
}

/** Simple additive weighting: the score is the weighted mean of the criteria. */
export function weightedSum<T>(
  candidates: readonly { candidate: T; scores: CriterionScores }[],
  weights: Readonly<Record<string, number>>,
): ScoredCandidate<T>[] {
  return candidates.map(({ candidate, scores }) => {
    const breakdown = breakdownOf(scores, weights);
    return {
      candidate,
      score: breakdown.reduce((sum, entry) => sum + entry.contribution, 0),
      breakdown,
    };
  });
}

/**
 * TOPSIS: closeness to the best available option and distance from the worst.
 *
 * The criteria are already on a common 0-to-1 scale and already oriented so that
 * higher is better, so the usual vector normalisation step would only rescale
 * them; it is applied anyway, because skipping it would make the weights mean
 * something different from what the method's literature says they mean.
 *
 * The breakdown returned alongside is the weighted-sum decomposition, not a
 * decomposition of the TOPSIS score. TOPSIS is a distance and does not decompose
 * additively; presenting one as though it did would be the opposite of the
 * transparency this module exists for. The explanation therefore describes the
 * listing's strengths, and the ordering is the method's.
 */
export function topsis<T>(
  candidates: readonly { candidate: T; scores: CriterionScores }[],
  weights: Readonly<Record<string, number>>,
): ScoredCandidate<T>[] {
  const criteria = Object.keys(weights) as RankingCriterion[];
  if (candidates.length === 0 || criteria.length === 0) {
    return [];
  }

  // Vector normalisation, per criterion, over the candidates in this run.
  const norms = new Map<RankingCriterion, number>();
  for (const criterion of criteria) {
    const sumOfSquares = candidates.reduce(
      (sum, { scores }) => sum + (scores[criterion] ?? 0) ** 2,
      0,
    );
    norms.set(criterion, Math.sqrt(sumOfSquares));
  }

  const weighted = candidates.map(({ scores }) =>
    Object.fromEntries(
      criteria.map((criterion) => {
        const norm = norms.get(criterion) ?? 0;
        const value = norm > 0 ? (scores[criterion] ?? 0) / norm : 0;
        return [criterion, value * (weights[criterion] ?? 0)];
      }),
    ),
  );

  const ideal = new Map<RankingCriterion, number>();
  const antiIdeal = new Map<RankingCriterion, number>();
  for (const criterion of criteria) {
    const column = weighted.map((row) => row[criterion] ?? 0);
    ideal.set(criterion, Math.max(...column));
    antiIdeal.set(criterion, Math.min(...column));
  }

  return candidates.map(({ candidate, scores }, index) => {
    const row = weighted[index] ?? {};
    let toIdeal = 0;
    let toAntiIdeal = 0;
    for (const criterion of criteria) {
      const value = row[criterion] ?? 0;
      toIdeal += (value - (ideal.get(criterion) ?? 0)) ** 2;
      toAntiIdeal += (value - (antiIdeal.get(criterion) ?? 0)) ** 2;
    }
    const distanceToIdeal = Math.sqrt(toIdeal);
    const distanceToAntiIdeal = Math.sqrt(toAntiIdeal);
    const denominator = distanceToIdeal + distanceToAntiIdeal;
    return {
      candidate,
      // Every candidate identical means every distance is zero. They are all
      // equally good, which is 1, not an undefined division.
      score: denominator > 0 ? distanceToAntiIdeal / denominator : 1,
      breakdown: breakdownOf(scores, weights),
    };
  });
}

/** Runs the chosen method and returns candidates in descending order of score. */
export function rank<T>(
  method: McdaMethod,
  candidates: readonly { candidate: T; scores: CriterionScores }[],
  weights: Readonly<Record<string, number>>,
): ScoredCandidate<T>[] {
  const scored =
    method === 'TOPSIS' ? topsis(candidates, weights) : weightedSum(candidates, weights);
  return [...scored].sort((a, b) => b.score - a.score);
}
