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

  /** Where the Python ML service listens. Compose puts it on the host network. */
  ML_BASE_URL: z.url().default('http://localhost:8000'),
  /**
   * A valuation is an enhancement to a listing page, so the page must not wait
   * long for one. Two seconds is generous for a single tree ensemble.
   */
  ML_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
  /**
   * Embedding is a different order of work from valuation and gets its own
   * budget. A LightGBM prediction is a tree traversal measured in microseconds;
   * encoding a batch of sixty-four listing descriptions is seconds of CPU in a
   * transformer. One timeout for both would either cut the encoder off or make a
   * dead valuation service hold a listing page open for half a minute.
   */
  ML_EMBED_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),

  /** Optional. Without it the application runs, uncached. */
  REDIS_URL: z.string().min(1).optional(),

  /**
   * Which language model backs the AI features. `rule-based` performs no network
   * call and is the default, so a fresh checkout with no keys works completely.
   */
  LLM_PROVIDER: z.enum(['rule-based', 'gemini', 'ollama']).default('rule-based'),
  /** Master switch, independent of the provider; only tests and incidents use it. */
  LLM_ENABLED: booleanString.default(true),
  /**
   * Google AI Studio key. The project's rule is that billing is never enabled on
   * that Google project, so the free tier's limits below are hard limits.
   */
  GEMINI_API_KEY: z.string().default(''),
  /**
   * Left unset, the model is chosen to suit the provider: a Flash model for
   * Gemini, because that is what the free tier serves, and a small local one for
   * Ollama. A single default would hand one provider the other's model name.
   */
  LLM_MODEL: z.string().min(1).optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(8_000),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  /** A model on a laptop is slower than one in a data centre. */
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(30_000),
  /** Free-tier allowances, counted in Redis and shared across API processes. */
  LLM_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(1_000).default(10),
  LLM_REQUESTS_PER_DAY: z.coerce.number().int().min(1).max(100_000).default(250),
  /** Identical prompts are answered from cache for this long. */
  LLM_CACHE_TTL_SECONDS: z.coerce.number().int().min(60).max(2_592_000).default(86_400),
});

export type Env = z.infer<typeof envSchema>;
