import type { OpenAPIObject } from '@nestjs/swagger';
import type { ApiError } from '@smartestate/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './setup/test-app.js';

describe('platform', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes liveness and readiness probes outside the api prefix', async () => {
    const live = await app.request('GET', '/health');
    expect(live.statusCode).toBe(200);
    expect(live.json<{ status: string }>().status).toBe('ok');

    const ready = await app.request('GET', '/health/ready');
    expect(ready.statusCode).toBe(200);
    expect(ready.json<{ checks: { database: string } }>().checks.database).toBe('up');
  });

  it('publishes an OpenAPI document whose components come from the Zod contracts', async () => {
    const response = await app.request('GET', '/docs/openapi.json');
    expect(response.statusCode).toBe(200);
    const document = response.json<OpenAPIObject>();
    expect(document.openapi).toMatch(/^3\./);
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/auth/login',
        '/api/listings',
        '/api/listings/{idOrPublicId}',
        '/api/users/me',
        '/health',
      ]),
    );
    const schemas = document.components?.schemas ?? {};
    expect(schemas.RegisterBodyDto).toMatchObject({
      type: 'object',
      required: ['email', 'password', 'displayName'],
      properties: { password: { type: 'string', minLength: 10, maxLength: 128 } },
    });
    expect(schemas.ListingDetailDto).toMatchObject({ type: 'object' });
    expect(schemas).toHaveProperty('ListingsPageDto');
    const searchParams = document.paths['/api/listings']?.get?.parameters ?? [];
    expect(searchParams.map((p) => ('name' in p ? p.name : ''))).toEqual(
      expect.arrayContaining(['priceMin', 'districts', 'sort', 'cursor']),
    );
  });

  it('wraps every error in the shared envelope', async () => {
    const notFound = await app.request('GET', '/api/does-not-exist');
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json<ApiError>()).toMatchObject({ statusCode: 404, error: 'Not Found' });

    const malformed = await app.request('POST', '/api/auth/login', {
      headers: { 'content-type': 'application/json' },
      body: '{"email": ',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json<ApiError>().code).toBe('MALFORMED_BODY');
  });

  it('applies the strict per-route rate limit to credential endpoints when enabled', async () => {
    const limited = await startTestApp({ RATE_LIMIT_ENABLED: 'true' });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const response = await limited.request('POST', '/api/auth/login', {
          body: { email: 'ratelimit@test.smartestate.local', password: 'wrong password!' },
          headers: { 'x-forwarded-for': '203.0.113.7' },
        });
        statuses.push(response.statusCode);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
