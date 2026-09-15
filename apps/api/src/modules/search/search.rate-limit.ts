/**
 * The budget for endpoints that may reach a language model.
 *
 * The brief asks for AI endpoints to be rate-limited per user, and the reason is
 * concrete rather than abstract: a free-tier allowance is shared by everyone,
 * so one person holding down a key would spend the day's quota for the whole
 * installation. The counter is keyed on the account when there is one and on the
 * address otherwise, so a signed-in user carries their own budget between
 * devices and an anonymous one cannot reset theirs by opening a new tab.
 *
 * Twenty a minute is generous for a person typing sentences and well under the
 * ten-a-minute model quota once caching is taken into account.
 */
import type { FastifyRequest } from 'fastify';

export const AI_REQUESTS_PER_MINUTE = 20;

export const ParsedQueryBodyLimit = {
  rateLimit: {
    max: AI_REQUESTS_PER_MINUTE,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest): string => request.user?.id ?? request.ip,
  },
};
