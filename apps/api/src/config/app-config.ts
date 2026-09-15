import { Inject } from '@nestjs/common';
import { envSchema, type Env } from './env.schema.js';

/** Structured, immutable runtime configuration derived from validated env vars. */
export interface AppConfig {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly port: number;
  readonly databaseUrl: string;
  readonly jwt: {
    readonly accessSecret: string;
    readonly accessTtlSeconds: number;
  };
  readonly refreshToken: {
    readonly ttlDays: number;
    readonly cookieSecure: boolean;
  };
  readonly corsOrigins: readonly string[];
  readonly logLevel: Env['LOG_LEVEL'];
  readonly rateLimit: {
    readonly enabled: boolean;
    readonly perMinute: number;
  };
  readonly swaggerEnabled: boolean;
  readonly ml: {
    readonly baseUrl: string;
    readonly timeoutMs: number;
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Constructor-parameter decorator: `constructor(@InjectConfig() private readonly config: AppConfig)`. */
export const InjectConfig = (): ParameterDecorator => Inject(APP_CONFIG);

export class ConfigValidationError extends Error {
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(
      `Invalid environment configuration:\n${issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`,
    );
    this.name = 'ConfigValidationError';
  }
}

export function loadConfig(
  source: Readonly<Record<string, string | undefined>> = process.env,
): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const env = result.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.API_PORT,
    databaseUrl: env.DATABASE_URL,
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    },
    refreshToken: {
      ttlDays: env.REFRESH_TOKEN_TTL_DAYS,
      cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    },
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    logLevel: env.LOG_LEVEL,
    rateLimit: {
      enabled: env.RATE_LIMIT_ENABLED,
      perMinute: env.RATE_LIMIT_MAX,
    },
    swaggerEnabled: env.SWAGGER_ENABLED,
    ml: {
      // Trailing slashes would double up when a path is appended.
      baseUrl: env.ML_BASE_URL.replace(/\/+$/, ''),
      timeoutMs: env.ML_TIMEOUT_MS,
    },
  };
}
