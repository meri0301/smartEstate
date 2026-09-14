import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import { TokenService } from './token.service.js';

const secret = 'k'.repeat(32);
const config = {
  jwt: { accessSecret: secret, accessTtlSeconds: 900 },
  refreshToken: { ttlDays: 30, cookieSecure: false },
} as AppConfig;

describe('TokenService', () => {
  const jwt = new JwtService();
  const service = new TokenService(jwt, config);
  const user = {
    id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
    email: 'a@b.co',
    role: 'AGENT',
    locale: 'ru',
  } as const;

  it('issues an access token carrying the identity claims and the configured lifetime', async () => {
    const issued = await service.issueAccessToken(user);
    expect(issued.expiresIn).toBe(900);
    const claims = await jwt.verifyAsync<Record<string, unknown>>(issued.token, { secret });
    expect(claims).toMatchObject({ sub: user.id, email: user.email, role: 'AGENT', locale: 'ru' });
    expect((claims.exp as number) - (claims.iat as number)).toBe(900);
  });

  it('generates unpredictable, URL-safe refresh tokens', () => {
    const a = service.generateRefreshToken();
    const b = service.generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('hashes refresh tokens deterministically with SHA-256', () => {
    const token = service.generateRefreshToken();
    expect(service.hashRefreshToken(token)).toBe(service.hashRefreshToken(token));
    expect(service.hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(service.hashRefreshToken(token)).not.toBe(service.hashRefreshToken(`${token}x`));
  });

  it('computes refresh expiry from the configured number of days', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    expect(service.refreshTokenExpiry(now).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
