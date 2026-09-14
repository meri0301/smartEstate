import { z } from 'zod';
import { localeSchema, roleSchema } from './common/enums.js';
import { isoDateTimeSchema, uuidSchema } from './common/primitives.js';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Length-based policy; complexity rules are avoided per NIST SP 800-63B. */
export const passwordSchema = z.string().min(10).max(128);

export const displayNameSchema = z.string().trim().min(2).max(80);

export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  locale: localeSchema.default('hy'),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

/** Public representation of an account; never includes credentials. */
export const userSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  role: roleSchema,
  locale: localeSchema,
  displayName: z.string(),
  createdAt: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  /** Access-token lifetime in seconds. The refresh token travels in an httpOnly cookie. */
  expiresIn: z.number().int().positive(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** Name of the httpOnly cookie carrying the refresh token. */
export const REFRESH_COOKIE_NAME = 'smartestate_refresh';
