import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators.js';
import { extractBearerToken, JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

const secret = 's'.repeat(32);
const config = { jwt: { accessSecret: secret, accessTtlSeconds: 900 } } as AppConfig;
const jwt = new JwtService({ secret });

function contextWith(
  headers: Record<string, string>,
  metadata: Record<string, unknown>,
  user?: AuthenticatedUser,
): {
  context: ExecutionContext;
  request: { headers: Record<string, string>; user?: AuthenticatedUser };
} {
  const request: { headers: Record<string, string>; user?: AuthenticatedUser } = { headers, user };
  const handler = (): void => undefined;
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('extractBearerToken', () => {
  it('accepts a well-formed header case-insensitively', () => {
    expect(extractBearerToken('Bearer abc.def')).toBe('abc.def');
    expect(extractBearerToken('bearer abc')).toBe('abc');
  });

  it('rejects other schemes, empty tokens and extra parts', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken('Bearer a b')).toBeNull();
  });
});

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(new Reflector(), jwt, config);
  const claims = { sub: 'u1', email: 'a@b.co', role: 'USER', locale: 'hy' } as const;

  it('attaches the user for a valid token', async () => {
    const token = await jwt.signAsync(claims);
    const { context, request } = contextWith({ authorization: `Bearer ${token}` }, {});
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', email: 'a@b.co', role: 'USER', locale: 'hy' });
  });

  it('rejects missing and invalid tokens on protected routes', async () => {
    await expect(guard.canActivate(contextWith({}, {}).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer not-a-jwt' }, {}).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects tokens signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'x'.repeat(32) }).signAsync(claims);
    await expect(
      guard.canActivate(contextWith({ authorization: `Bearer ${forged}` }, {}).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lets anonymous callers through public routes and still attaches a valid user', async () => {
    const anonymous = contextWith({}, { [IS_PUBLIC_KEY]: true });
    await expect(guard.canActivate(anonymous.context)).resolves.toBe(true);
    expect(anonymous.request.user).toBeUndefined();

    const token = await jwt.signAsync(claims);
    const authenticated = contextWith(
      { authorization: `Bearer ${token}` },
      { [IS_PUBLIC_KEY]: true },
    );
    await expect(guard.canActivate(authenticated.context)).resolves.toBe(true);
    expect(authenticated.request.user?.id).toBe('u1');

    const garbage = contextWith({ authorization: 'Bearer nope' }, { [IS_PUBLIC_KEY]: true });
    await expect(guard.canActivate(garbage.context)).resolves.toBe(true);
    expect(garbage.request.user).toBeUndefined();
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const user: AuthenticatedUser = { id: 'u1', email: 'a@b.co', role: 'AGENT', locale: 'en' };

  it('allows routes without role metadata', () => {
    expect(guard.canActivate(contextWith({}, {}).context)).toBe(true);
  });

  it('allows a user holding one of the required roles', () => {
    expect(
      guard.canActivate(contextWith({}, { [ROLES_KEY]: ['AGENT', 'ADMIN'] }, user).context),
    ).toBe(true);
  });

  it('forbids a user with an insufficient role or no identity', () => {
    expect(() =>
      guard.canActivate(contextWith({}, { [ROLES_KEY]: ['ADMIN'] }, user).context),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith({}, { [ROLES_KEY]: ['ADMIN'] }).context)).toThrow(
      ForbiddenException,
    );
  });
});
