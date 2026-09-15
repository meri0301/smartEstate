/**
 * Turning what people did with a ranking into a number about the ranking.
 *
 * The recommender shows an ordered list; the interface records what the reader
 * did with each item; these functions read the second as a judgement on the
 * first. Every definition here is standard and cited, because the evaluation
 * chapter will be read by people who know the standard ones.
 *
 * Relevance is implicit and graded. Nobody is asked to rate a listing; a
 * favourite is taken to mean more than a click, a dismissal to mean nothing at
 * all. The gains are named constants because they are a judgement, not a fact,
 * and a reader is entitled to disagree with them.
 */
import type { InteractionType, MetricEstimate } from '@smartestate/contracts';

/**
 * How much each action is worth as evidence of relevance.
 *
 * Contacting the seller and saving the listing are the two things a person does
 * about a flat they might actually buy. Comparing it is interest. Looking at it
 * is the weakest signal there is, but it is a signal. Removing a favourite or
 * dismissing a listing is a judgement too — that it was not relevant — and
 * scores zero rather than being ignored, so it can cancel a click.
 */
export const RELEVANCE_GAINS: Readonly<Record<InteractionType, number>> = {
  CONTACT: 3,
  FAVORITE: 3,
  COMPARE: 2,
  DWELL: 1,
  VIEW: 1,
  UNFAVORITE: 0,
  DISMISS: 0,
};

/** Ranking metrics are computed over the first k results. */
export const DEFAULT_K = 10;

/**
 * Fewer sessions than this in any arm and the comparison is not reported.
 *
 * Thirty is the conventional point at which a mean's sampling distribution is
 * treated as roughly normal; it is not magic, and it is published in the
 * response so the page can say "not yet" rather than imply a winner.
 */
export const MINIMUM_SESSIONS_PER_ARM = 30;

/** One session: the listings shown, in order, and how each was judged. */
export interface JudgedSession {
  /** Listing ids in the order they were shown. */
  shown: readonly string[];
  /** Graded relevance per listing id. Absent means no interaction. */
  relevance: ReadonlyMap<string, number>;
}

/**
 * The relevance of one listing from everything the reader did to it.
 *
 * The strongest signal wins, except that an explicit rejection after a click —
 * viewed, then dismissed — reads as rejection. That is what a person means by
 * dismissing something they looked at.
 */
export function gradeListing(types: readonly InteractionType[]): number {
  if (types.length === 0) {
    return 0;
  }
  const rejected = types.includes('DISMISS') || types.includes('UNFAVORITE');
  if (rejected) {
    return 0;
  }
  return Math.max(...types.map((type) => RELEVANCE_GAINS[type]));
}

/** Share of the top k that were judged relevant at all. */
export function precisionAtK(session: JudgedSession, k: number): number {
  const top = session.shown.slice(0, k);
  if (top.length === 0) {
    return 0;
  }
  const hits = top.filter((id) => (session.relevance.get(id) ?? 0) > 0).length;
  return hits / top.length;
}

/**
 * Discounted cumulative gain of the first k, against the best possible order.
 *
 * Järvelin and Kekäläinen (2002): each position's gain is divided by the log of
 * its rank, so a relevant item at the top is worth more than the same item
 * further down, and the whole is divided by what a perfect ordering of the same
 * items would have scored. One means the ranking put the things the reader
 * wanted first; zero means nothing shown was wanted.
 */
export function ndcgAtK(session: JudgedSession, k: number): number {
  const gains = session.shown.slice(0, k).map((id) => session.relevance.get(id) ?? 0);
  const ideal = [...gains].sort((a, b) => b - a);
  const idealDcg = dcg(ideal);
  return idealDcg === 0 ? 0 : dcg(gains) / idealDcg;
}

function dcg(gains: readonly number[]): number {
  return gains.reduce((sum, gain, index) => sum + gain / Math.log2(index + 2), 0);
}

/** Whether anything shown was acted on at all. */
export function hadFeedback(session: JudgedSession): boolean {
  return session.shown.some((id) => session.relevance.has(id));
}

/** Mean, standard error and n, or an honest zero-count. */
export function estimate(values: readonly number[]): MetricEstimate {
  const n = values.length;
  if (n === 0) {
    return { mean: 0, n: 0 };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n === 1) {
    return { mean, standardError: 0, n };
  }
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  return { mean, standardError: Math.sqrt(variance / n), n };
}

/**
 * The difference of two means with a 95% Welch interval.
 *
 * Welch rather than pooled because there is no reason to believe the two arms
 * have the same variance, and Welch costs nothing when they do. The critical
 * value is the normal one, which is what the thirty-session minimum buys; below
 * that the caller does not compute this at all.
 */
export function welchDifference(
  a: MetricEstimate,
  b: MetricEstimate,
): { difference: number; confidenceLow: number; confidenceHigh: number } {
  const difference = a.mean - b.mean;
  const combined = Math.sqrt((a.standardError ?? 0) ** 2 + (b.standardError ?? 0) ** 2);
  const halfWidth = 1.96 * combined;
  return {
    difference,
    confidenceLow: difference - halfWidth,
    confidenceHigh: difference + halfWidth,
  };
}
