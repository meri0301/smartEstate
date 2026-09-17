/**
 * The budget for writing a review.
 *
 * Reviews are open by product decision: no account, and published on
 * submission. That removes both of the things that usually slow abuse down, so
 * the remaining brake is this one. Three an hour per address is more than any
 * genuine visitor needs — nobody has four opinions of a valuation tool in an
 * afternoon — and low enough that filling the front page takes effort rather
 * than a loop.
 *
 * Keyed on the address alone rather than on the account, because there is no
 * account on this route by design.
 */
import type { FastifyRequest } from 'fastify';

export const REVIEWS_PER_HOUR = 3;

export const WriteReviewRateLimit = {
  rateLimit: {
    max: REVIEWS_PER_HOUR,
    timeWindow: '1 hour',
    keyGenerator: (request: FastifyRequest): string => request.ip,
  },
};
