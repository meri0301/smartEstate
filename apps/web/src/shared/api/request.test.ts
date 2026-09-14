import type { AuthResponse } from '@smartestate/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-error.js';
import { createApiClient } from './client.js';
import { apiRequest } from './request.js';
import { sessionStore, useSessionStore } from './session-store.js';

const authResponse: AuthResponse = {
  user: {
    id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
    email: 'ani@example.com',
    role: 'USER',
    locale: 'hy',
    displayName: 'Ani',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  accessToken: 'fresh-token',
  tokenType: 'Bearer',
  expiresIn: 900,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function unauthorized(): Response {
  return jsonResponse(401, {
    statusCode: 401,
    error: 'Unauthorized',
    message: 'expired',
    code: 'UNAUTHENTICATED',
  });
}

describe('apiRequest with the typed client', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock });

  beforeEach(() => {
    fetchMock.mockReset();
    useSessionStore.setState({
      status: 'authenticated',
      accessToken: 'stale-token',
      user: authResponse.user,
    });
  });

  afterEach(() => {
    useSessionStore.setState({ status: 'unknown', accessToken: null, user: null });
  });

  it('attaches the bearer token and unwraps the data', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [{ slug: 'kentron' }]));
    const data = await apiRequest(() => client.GET('/api/districts'), { client });
    expect(data).toEqual([{ slug: 'kentron' }]);
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe('http://api.test/api/districts');
    expect(request.headers.get('authorization')).toBe('Bearer stale-token');
    expect(request.credentials).toBe('include');
  });

  it('refreshes once on 401 and replays with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(jsonResponse(200, authResponse))
      .mockResolvedValueOnce(jsonResponse(200, { id: authResponse.user.id }));

    const data = await apiRequest(() => client.GET('/api/users/me'), { client });

    expect(data).toEqual({ id: authResponse.user.id });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((call) => (call[0] as Request).url);
    expect(urls).toEqual([
      'http://api.test/api/users/me',
      'http://api.test/api/auth/refresh',
      'http://api.test/api/users/me',
    ]);
    expect((fetchMock.mock.calls[2]?.[0] as Request).headers.get('authorization')).toBe(
      'Bearer fresh-token',
    );
    expect(sessionStore.getAccessToken()).toBe('fresh-token');
  });

  it('clears the session and throws when the refresh itself is rejected', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(
      jsonResponse(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'reuse',
        code: 'REFRESH_REUSED',
      }),
    );

    await expect(apiRequest(() => client.GET('/api/users/me'), { client })).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useSessionStore.getState().status).toBe('anonymous');
    expect(sessionStore.getAccessToken()).toBeNull();
  });

  it('does not attempt a refresh when told not to (auth routes)', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(
      apiRequest(
        () => client.POST('/api/auth/login', { body: { email: 'a@b.co', password: 'x' } }),
        {
          client,
          retryOnUnauthorized: false,
        },
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh between concurrent 401s', async () => {
    fetchMock.mockImplementation((input) => {
      const request = input as Request;
      if (request.url.endsWith('/api/auth/refresh')) {
        return Promise.resolve(jsonResponse(200, authResponse));
      }
      return Promise.resolve(
        request.headers.get('authorization') === 'Bearer fresh-token'
          ? jsonResponse(200, { ok: true })
          : unauthorized(),
      );
    });

    await Promise.all([
      apiRequest(() => client.GET('/api/users/me'), { client }),
      apiRequest(() => client.GET('/api/districts'), { client }),
      apiRequest(() => client.GET('/health'), { client }),
    ]);

    const refreshes = fetchMock.mock.calls.filter((call) =>
      (call[0] as Request).url.endsWith('/api/auth/refresh'),
    );
    expect(refreshes).toHaveLength(1);
  });

  it('converts non-envelope failures and network errors into ApiError', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(apiRequest(() => client.GET('/api/districts'), { client })).rejects.toMatchObject({
      statusCode: 502,
    });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiRequest(() => client.GET('/api/districts'), { client })).rejects.toMatchObject({
      statusCode: 0,
      code: 'NETWORK',
    });
  });
});
