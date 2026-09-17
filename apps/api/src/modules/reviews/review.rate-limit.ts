/**
 * The budget for writing a review.
 *
 * Reviews are open by product decision: no account, and published on
 * submission. That removes both of the things that usually slow abuse down, so
 * the remaining brake is this one.
 *
 * Keyed on the address alone, because there is no account on this route by
 * design. That has a consequence worth knowing in development: behind the Vite
 * dev proxy every browser request reaches the API from `127.0.0.1`, so the
 * whole machine — and anything calling the API by hand — shares one budget.
 * The same is true in production for anyone behind a shared address, which is
 * most of an office.
 *
 * Ten an hour is the compromise. It is well above what a person writing about a
 * valuation tool will ever need, and far below what would let someone fill the
 * front page. `REVIEWS_PER_HOUR` raises it where a demonstration needs to add
 * several in a sitting.
 *
 * It is read from the environment here rather than from `AppConfig`, because a
 * route's rate limit is attached by a decorator that is evaluated when the
 * module is imported — before Nest has built anything to inject.
 */
import type { FastifyRequest } from 'fastify';

export const DEFAULT_REVIEWS_PER_HOUR = 10;

/** Parses the override, ignoring anything that is not a positive whole number. */
export function reviewsPerHour(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_REVIEWS_PER_HOUR;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_REVIEWS_PER_HOUR;
}

export const REVIEWS_PER_HOUR = reviewsPerHour(process.env.REVIEWS_PER_HOUR);

export const WriteReviewRateLimit = {
  rateLimit: {
    max: REVIEWS_PER_HOUR,
    timeWindow: '1 hour',
    keyGenerator: (request: FastifyRequest): string => request.ip,
  },
};
