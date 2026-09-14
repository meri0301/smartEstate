import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

const config = {
  jwt: { accessSecret: 's'.repeat(32), accessTtlSeconds: 900 },
  refreshToken: { ttlDays: 30, cookieSecure: false },
} as AppConfig;

/** Typed access to the first argument of the first call of a mock. */
function firstCallArg(fn: { mock: { calls: unknown[][] } }): unknown {
  const arg = fn.mock.calls[0]?.[0];
  if (arg === undefined) {
    throw new Error('mock was not called');
  }
  return arg;
}

function createPrismaMock() {
  const refreshToken = {
    findUnique: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'rt-new' }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const user = { findUnique: vi.fn(), create: vi.fn() };
  const prisma = {
    user,
    refreshToken,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ refreshToken })),
  };
  return prisma;
}

const baseUser = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
  email: 'ani@example.com',
  passwordHash: '',
  role: 'USER',
  locale: 'hy',
  isActive: true,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  profile: { userId: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f', displayName: 'Ani' },
};

describe('AuthService', () => {
  const passwords = new PasswordService();
  const tokens = new TokenService(new JwtService(), config);
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AuthService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    service = new AuthService(prisma as unknown as PrismaService, passwords, tokens);
    baseUser.passwordHash = await passwords.hash('correct horse battery');
  });

  describe('register', () => {
    it('creates the account with a hashed password and opens a session', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(baseUser);

      const session = await service.register(
        {
          email: 'ani@example.com',
          password: 'correct horse battery',
          displayName: 'Ani',
          locale: 'hy',
        },
        { userAgent: 'vitest' },
      );

      const created = firstCallArg(prisma.user.create) as { data: { passwordHash: string } };
      expect(created.data.passwordHash).not.toBe('correct horse battery');
      expect(created.data.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(session.response.user).toEqual({
        id: baseUser.id,
        email: 'ani@example.com',
        role: 'USER',
        locale: 'hy',
        displayName: 'Ani',
        createdAt: '2026-09-01T00:00:00.000Z',
      });
      expect(session.response.tokenType).toBe('Bearer');
      expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{64}$/);
      // Only the hash is persisted.
      const token = firstCallArg(prisma.refreshToken.create) as { data: { tokenHash: string } };
      expect(token.data.tokenHash).toBe(tokens.hashRefreshToken(session.refreshToken));
    });

    it('rejects a duplicate email with 409', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register(
          {
            email: 'ani@example.com',
            password: 'correct horse battery',
            displayName: 'Ani',
            locale: 'hy',
          },
          {},
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('opens a session for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      const session = await service.login(
        { email: 'ani@example.com', password: 'correct horse battery' },
        {},
      );
      expect(session.response.user.email).toBe('ani@example.com');
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an unknown email and a wrong password with the same error', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknown = service.login({ email: 'nobody@example.com', password: 'whatever' }, {});
      await expect(unknown).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });

      prisma.user.findUnique.mockResolvedValue(baseUser);
      const wrong = service.login({ email: 'ani@example.com', password: 'wrong password' }, {});
      await expect(wrong).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects disabled accounts', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });
      await expect(
        service.login({ email: 'ani@example.com', password: 'correct horse battery' }, {}),
      ).rejects.toMatchObject({ response: { code: 'ACCOUNT_DISABLED' } });
    });
  });

  describe('refresh', () => {
    const raw = 'r'.repeat(64);
    const stored = {
      id: 'rt-old',
      userId: baseUser.id,
      familyId: 'fam-1',
      tokenHash: '',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: baseUser,
    };

    beforeEach(() => {
      stored.tokenHash = tokens.hashRefreshToken(raw);
    });

    it('rotates the token: new token created, old one revoked and linked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored);

      const session = await service.refresh(raw, { ipAddress: '127.0.0.1' });

      expect(session.refreshToken).not.toBe(raw);
      const created = firstCallArg(prisma.refreshToken.create) as {
        data: { familyId: string; tokenHash: string };
      };
      expect(created.data.familyId).toBe('fam-1');
      expect(created.data.tokenHash).toBe(tokens.hashRefreshToken(session.refreshToken));
      const updated = firstCallArg(prisma.refreshToken.update) as {
        where: { id: string };
        data: { replacedBy: string; revokedAt: Date };
      };
      expect(updated.where).toEqual({ id: 'rt-old' });
      expect(updated.data.replacedBy).toBe('rt-new');
      expect(updated.data.revokedAt).toBeInstanceOf(Date);
    });

    it('revokes the whole family when an already-rotated token is replayed', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ ...stored, revokedAt: new Date() });

      await expect(service.refresh(raw, {})).rejects.toMatchObject({
        response: { code: 'REFRESH_REUSED' },
      });
      const revoked = firstCallArg(prisma.refreshToken.updateMany) as {
        where: { familyId: string; revokedAt: null };
      };
      expect(revoked.where).toEqual({ familyId: 'fam-1', revokedAt: null });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects unknown, expired and missing tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh(raw, {})).rejects.toMatchObject({
        response: { code: 'REFRESH_INVALID' },
      });

      prisma.refreshToken.findUnique.mockResolvedValue({
        ...stored,
        expiresAt: new Date(Date.now() - 1),
      });
      await expect(service.refresh(raw, {})).rejects.toMatchObject({
        response: { code: 'REFRESH_EXPIRED' },
      });

      await expect(service.refresh(undefined, {})).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes only the presented token and ignores missing cookies', async () => {
      await service.logout('some-token');
      const revoked = firstCallArg(prisma.refreshToken.updateMany) as {
        where: { tokenHash: string; revokedAt: null };
      };
      expect(revoked.where).toEqual({
        tokenHash: tokens.hashRefreshToken('some-token'),
        revokedAt: null,
      });

      prisma.refreshToken.updateMany.mockClear();
      await service.logout(undefined);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('logoutAll revokes every active token of the user', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
      expect(await service.logoutAll(baseUser.id)).toBe(3);
      const revoked = firstCallArg(prisma.refreshToken.updateMany) as {
        where: { userId: string; revokedAt: null };
      };
      expect(revoked.where).toEqual({ userId: baseUser.id, revokedAt: null });
    });
  });
});
