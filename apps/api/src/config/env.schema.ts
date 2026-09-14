import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * Every environment variable the API reads, validated once at start-up.
 * A missing or malformed value fails fast with a readable message instead of
 * surfacing as an obscure runtime error later.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((url) => url.startsWith('postgresql://') || url.startsWith('postgres://'), {
      message: 'DATABASE_URL must be a postgresql:// connection string',
    }),

  /** HS256 signing key for access tokens; 32+ characters of entropy. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** Defaults to true in production, false otherwise (local HTTP). */
  COOKIE_SECURE: booleanString.optional(),

  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Master switch for rate limiting; only tests turn it off. */
  RATE_LIMIT_ENABLED: booleanString.default(true),
  /** Requests per minute per IP for ordinary routes; credential routes carry stricter, route-level limits. */
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  SWAGGER_ENABLED: booleanString.default(true),
});

export type Env = z.infer<typeof envSchema>;
