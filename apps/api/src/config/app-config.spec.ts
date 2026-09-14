import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './app-config.js';

const minimal = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('applies development defaults', () => {
    const config = loadConfig(minimal);
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.jwt.accessTtlSeconds).toBe(900);
    expect(config.refreshToken.ttlDays).toBe(30);
    expect(config.refreshToken.cookieSecure).toBe(false);
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
    expect(config.swaggerEnabled).toBe(true);
    expect(config.rateLimit).toEqual({ enabled: true, perMinute: 300 });
  });

  it('secures cookies by default in production', () => {
    expect(loadConfig({ ...minimal, NODE_ENV: 'production' }).refreshToken.cookieSecure).toBe(true);
    expect(
      loadConfig({ ...minimal, NODE_ENV: 'production', COOKIE_SECURE: 'false' }).refreshToken
        .cookieSecure,
    ).toBe(false);
  });

  it('parses comma-separated CORS origins', () => {
    expect(
      loadConfig({ ...minimal, CORS_ORIGINS: 'http://a.test, https://b.test ,' }).corsOrigins,
    ).toEqual(['http://a.test', 'https://b.test']);
  });

  it('rejects a short JWT secret with a readable error', () => {
    expect(() => loadConfig({ ...minimal, JWT_ACCESS_SECRET: 'short' })).toThrow(
      ConfigValidationError,
    );
    try {
      loadConfig({ ...minimal, JWT_ACCESS_SECRET: 'short' });
    } catch (error) {
      expect(error instanceof ConfigValidationError && error.message).toContain(
        'JWT_ACCESS_SECRET',
      );
    }
  });

  it('rejects a non-postgres database url', () => {
    expect(() => loadConfig({ ...minimal, DATABASE_URL: 'mysql://x' })).toThrow(
      ConfigValidationError,
    );
  });

  it('ignores unrelated environment variables', () => {
    expect(() => loadConfig({ ...minimal, PATH: '/usr/bin', HOME: '/root' })).not.toThrow();
  });
});
