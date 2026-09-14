import { REFRESH_COOKIE_NAME, type ApiError, type AuthResponse } from '@smartestate/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refreshCookie, registerUser, startTestApp, type TestApp } from './setup/test-app.js';

describe('auth', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers an account, returns a session and sets a scoped httpOnly refresh cookie', async () => {
    const email = `register-${String(Date.now())}@test.smartestate.local`;
    const response = await app.request('POST', '/api/auth/register', {
      body: { email, password: 'a sufficiently long password', displayName: 'Ani' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<AuthResponse>();
    expect(body.user).toMatchObject({ email, role: 'USER', locale: 'hy', displayName: 'Ani' });
    expect(body.tokenType).toBe('Bearer');
    expect(body.expiresIn).toBe(900);
    expect(body.accessToken.split('.')).toHaveLength(3);

    const cookie = response.cookies.find((c) => c.name === REFRESH_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe('/api/auth');
    expect(cookie?.sameSite).toBe('Strict');
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('rejects duplicate emails with 409 and invalid bodies with field-level details', async () => {
    const session = await registerUser(app);
    const duplicate = await app.request('POST', '/api/auth/register', {
      body: {
        email: session.email.toUpperCase(),
        password: 'another long password',
        displayName: 'Dup',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<ApiError>().code).toBe('EMAIL_TAKEN');

    const invalid = await app.request('POST', '/api/auth/register', {
      body: { email: 'not-an-email', password: 'short', displayName: 'X' },
    });
    expect(invalid.statusCode).toBe(400);
    const error = invalid.json<ApiError>();
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.map((d) => d.path).sort()).toEqual(['displayName', 'email', 'password']);
  });

  it('logs in with valid credentials and answers wrong ones with one indistinguishable error', async () => {
    const session = await registerUser(app);
    const ok = await app.request('POST', '/api/auth/login', {
      body: { email: session.email, password: session.password },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<AuthResponse>().user.id).toBe(session.user.id);

    const wrongPassword = await app.request('POST', '/api/auth/login', {
      body: { email: session.email, password: 'nope nope nope' },
    });
    const unknownUser = await app.request('POST', '/api/auth/login', {
      body: { email: 'nobody@test.smartestate.local', password: 'nope nope nope' },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(wrongPassword.json<ApiError>()).toEqual(unknownUser.json<ApiError>());
  });

  it('rotates the refresh token and revokes the whole family on replay', async () => {
    const session = await registerUser(app);

    const first = await app.request('POST', '/api/auth/refresh', {
      cookies: { [REFRESH_COOKIE_NAME]: session.refreshToken },
    });
    expect(first.statusCode).toBe(200);
    const rotated = refreshCookie(first);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(session.refreshToken);
    expect(first.json<AuthResponse>().accessToken).toBeTypeOf('string');

    // Replaying the consumed token is treated as theft…
    const replay = await app.request('POST', '/api/auth/refresh', {
      cookies: { [REFRESH_COOKIE_NAME]: session.refreshToken },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json<ApiError>().code).toBe('REFRESH_REUSED');

    // …and the legitimately rotated token dies with the family.
    const afterReplay = await app.request('POST', '/api/auth/refresh', {
      cookies: { [REFRESH_COOKIE_NAME]: rotated ?? '' },
    });
    expect(afterReplay.statusCode).toBe(401);
    expect(afterReplay.json<ApiError>().code).toBe('REFRESH_REUSED');
  });

  it('rejects refresh without a cookie or with an unknown one', async () => {
    const missing = await app.request('POST', '/api/auth/refresh');
    expect(missing.statusCode).toBe(401);
    expect(missing.json<ApiError>().code).toBe('REFRESH_MISSING');

    const unknown = await app.request('POST', '/api/auth/refresh', {
      cookies: { [REFRESH_COOKIE_NAME]: 'x'.repeat(64) },
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json<ApiError>().code).toBe('REFRESH_INVALID');
  });

  it('logout revokes the presented token and clears the cookie', async () => {
    const session = await registerUser(app);
    const logout = await app.request('POST', '/api/auth/logout', {
      cookies: { [REFRESH_COOKIE_NAME]: session.refreshToken },
    });
    expect(logout.statusCode).toBe(204);
    const cleared = logout.cookies.find((c) => c.name === REFRESH_COOKIE_NAME);
    expect(cleared?.value).toBe('');

    const refresh = await app.request('POST', '/api/auth/refresh', {
      cookies: { [REFRESH_COOKIE_NAME]: session.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('logout-all requires an access token and revokes every session of the user', async () => {
    const session = await registerUser(app);
    const second = await app.request('POST', '/api/auth/login', {
      body: { email: session.email, password: session.password },
    });
    const secondRefresh = refreshCookie(second) ?? '';

    expect((await app.request('POST', '/api/auth/logout-all')).statusCode).toBe(401);

    const all = await app.request('POST', '/api/auth/logout-all', { token: session.accessToken });
    expect(all.statusCode).toBe(204);
    expect(
      (
        await app.request('POST', '/api/auth/refresh', {
          cookies: { [REFRESH_COOKIE_NAME]: session.refreshToken },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.request('POST', '/api/auth/refresh', {
          cookies: { [REFRESH_COOKIE_NAME]: secondRefresh },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('protects routes: missing, malformed and foreign tokens are rejected', async () => {
    expect((await app.request('GET', '/api/users/me')).statusCode).toBe(401);
    expect((await app.request('GET', '/api/users/me', { token: 'garbage' })).statusCode).toBe(401);
    const response = await app.request('GET', '/api/users/me', {
      headers: { authorization: 'Basic abc' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json<ApiError>().code).toBe('UNAUTHENTICATED');
  });
});
