/**
 * Reviews of the product, written from the landing page.
 *
 * Unauthenticated by product decision: a review carries the name somebody
 * typed and nothing has verified it. Nothing in these shapes joins a review to
 * an account, so no part of the system can accidentally present one as a
 * confirmed identity.
 */
import { z } from 'zod';
import { localeSchema } from './common/enums.js';
import { isoDateTimeSchema, uuidSchema } from './common/primitives.js';

/**
 * Who a reviewer says they are.
 *
 * A fixed list rather than free text. The label sits beside a name on the front
 * page, it has to exist in three languages, and an open field is an invitation
 * to claim a title nobody checked.
 */
export const REVIEWER_ROLES = [
  'HOMEBUYER',
  'INVESTOR',
  'PROPERTY_MANAGER',
  'AGENT',
  'OTHER',
] as const;
export const reviewerRoleSchema = z.enum(REVIEWER_ROLES);
export type ReviewerRole = z.infer<typeof reviewerRoleSchema>;

export const REVIEW_NAME_MAX = 80;
export const REVIEW_BODY_MIN = 20;
export const REVIEW_BODY_MAX = 600;

/**
 * What the form sends.
 *
 * The lower bound on the body is the only quality gate there is, and it is
 * deliberately low: it stops an empty submission and a single stray character
 * without pretending to judge what someone has to say.
 */
export const createReviewRequestSchema = z.object({
  authorName: z.string().trim().min(2).max(REVIEW_NAME_MAX),
  authorRole: reviewerRoleSchema,
  body: z.string().trim().min(REVIEW_BODY_MIN).max(REVIEW_BODY_MAX),
  /** The language it was written in, so the interface can mark it. */
  locale: localeSchema,
});
export type CreateReviewRequest = z.infer<typeof createReviewRequestSchema>;

/**
 * A published review.
 *
 * `authorName` is unverified text. It is named plainly rather than as `author`
 * so that nothing reading this shape mistakes it for a user.
 */
export const reviewSchema = z.object({
  id: uuidSchema,
  authorName: z.string(),
  authorRole: reviewerRoleSchema,
  body: z.string(),
  /** Marked on the rendered quote, because a review cannot be translated. */
  locale: localeSchema,
  createdAt: isoDateTimeSchema,
});
export type Review = z.infer<typeof reviewSchema>;

export const reviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
export type ReviewsQuery = z.infer<typeof reviewsQuerySchema>;

export const reviewListSchema = z.object({
  items: z.array(reviewSchema),
  /** Published reviews in total, which may exceed the page returned. */
  total: z.number().int().min(0),
});
export type ReviewList = z.infer<typeof reviewListSchema>;

/**
 * How much work the product has actually done.
 *
 * The design's badge reads "10,000+ valuations completed". This is the real
 * count of valuations stored, which an examiner can check against the database.
 * Standalone quotes are not included: ADR-0019 does not store them, and a
 * number that counted them would be unverifiable.
 */
export const productStatsSchema = z.object({
  valuationsCompleted: z.number().int().min(0),
  listingsPublished: z.number().int().min(0),
});
export type ProductStats = z.infer<typeof productStatsSchema>;
