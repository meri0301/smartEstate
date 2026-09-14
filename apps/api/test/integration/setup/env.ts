/**
 * Runs in every integration worker before the test file: points the app at the
 * Testcontainers database and pins the rest of the configuration so results do
 * not depend on the developer's `.env`.
 */
import { inject } from 'vitest';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'integration-test-secret-0123456789abcdefghijklmnopqrstuvwxyz';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
process.env.COOKIE_SECURE = 'false';
process.env.CORS_ORIGINS = 'http://localhost:5173';
// Set INTEGRATION_LOG_LEVEL=error (or info) to see application logs while debugging a test.
process.env.LOG_LEVEL = process.env.INTEGRATION_LOG_LEVEL ?? 'silent';
process.env.SWAGGER_ENABLED = 'true';
// Credential routes carry a 10/min limit that the auth suite would trip; the
// platform suite re-enables limiting explicitly to test it.
process.env.RATE_LIMIT_ENABLED = 'false';
