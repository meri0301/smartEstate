import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { REFRESH_COOKIE_NAME, type AuthResponse, type Role } from '@smartestate/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { createApp } from '../../../src/app.factory.js';
import { PrismaService } from '../../../src/infrastructure/prisma/prisma.service.js';

export interface RequestOptions {
  body?: object | string;
  token?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface TestApp {
  app: NestFastifyApplication;
  request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    options?: RequestOptions,
  ): Promise<LightMyRequestResponse>;
  prisma(): PrismaService;
  close(): Promise<void>;
}

/** Boots the real application (in-process, no port) with optional env overrides. */
export async function startTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  const app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    request: (method, url, options = {}) =>
      app.inject({
        method,
        url,
        ...(options.body === undefined ? {} : { payload: options.body }),
        headers: {
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
          ...options.headers,
        },
        ...(options.cookies === undefined ? {} : { cookies: options.cookies }),
      }),
    prisma: () => app.get(PrismaService),
    close: async () => {
      await app.close();
      for (const [key, value] of previous) {
        if (value === undefined) {
          Reflect.deleteProperty(process.env, key);
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}

/** Reads a cookie value from the response's Set-Cookie header(s). */
export function cookieValue(response: LightMyRequestResponse, name: string): string | undefined {
  const cookie = response.cookies.find((c) => c.name === name);
  return cookie?.value;
}

export function refreshCookie(response: LightMyRequestResponse): string | undefined {
  return cookieValue(response, REFRESH_COOKIE_NAME);
}

let userCounter = 0;

export interface TestSession {
  user: AuthResponse['user'];
  accessToken: string;
  refreshToken: string;
  email: string;
  password: string;
}

/** Registers a fresh user (unique email per call) and returns its session. */
export async function registerUser(
  app: TestApp,
  overrides: { role?: Role; displayName?: string } = {},
): Promise<TestSession> {
  userCounter += 1;
  const email = `user${String(userCounter)}-${String(Date.now())}@test.smartestate.local`;
  const password = 'integration test password';
  const response = await app.request('POST', '/api/auth/register', {
    body: {
      email,
      password,
      displayName: overrides.displayName ?? `Tester ${String(userCounter)}`,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`register failed: ${String(response.statusCode)} ${response.body}`);
  }
  const body = response.json<AuthResponse>();
  const refreshToken = refreshCookie(response);
  if (refreshToken === undefined) {
    throw new Error('register did not set the refresh cookie');
  }

  if (overrides.role !== undefined && overrides.role !== 'USER') {
    await app.prisma().user.update({ where: { id: body.user.id }, data: { role: overrides.role } });
    // Re-login so the access token carries the new role.
    const login = await app.request('POST', '/api/auth/login', { body: { email, password } });
    const relogged = login.json<AuthResponse>();
    return {
      user: relogged.user,
      accessToken: relogged.accessToken,
      refreshToken: refreshCookie(login) ?? refreshToken,
      email,
      password,
    };
  }
  return { user: body.user, accessToken: body.accessToken, refreshToken, email, password };
}
