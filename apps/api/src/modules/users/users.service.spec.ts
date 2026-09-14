import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { AuditService } from '../admin/audit.service.js';
import { toMeResponse, UsersService } from './users.service.js';

const userId = '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f';
const otherId = '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e70';

const user = {
  id: userId,
  email: 'ani@example.com',
  passwordHash: 'x',
  role: 'USER' as const,
  locale: 'hy' as const,
  isActive: true,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-02T00:00:00Z'),
  profile: {
    userId,
    displayName: 'Ani',
    phone: null,
    budgetMinAmd: 30_000_000n,
    budgetMaxAmd: null,
    preferredRooms: [2, 3],
    priorities: { price: 0.6, commute: 0.4, junk: 'no' },
    commuteAnchorLabel: null,
    onboardingCompletedAt: null,
    updatedAt: new Date(),
  },
};

function createMocks() {
  const prisma = {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    profile: { findUnique: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma),
  );
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { prisma, audit };
}

describe('toMeResponse', () => {
  it('converts BigInt budgets to numbers and keeps only numeric priorities', () => {
    const me = toMeResponse(user, { lat: 40.18, lon: 44.51, label: 'Work' });
    expect(me.profile?.budgetMinAmd).toBe(30_000_000);
    expect(me.profile?.budgetMaxAmd).toBeNull();
    expect(me.profile?.priorities).toEqual({ price: 0.6, commute: 0.4 });
    expect(me.profile?.commuteAnchor).toEqual({ lat: 40.18, lon: 44.51, label: 'Work' });
    expect(me.displayName).toBe('Ani');
  });
});

describe('UsersService', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: UsersService;

  beforeEach(() => {
    mocks = createMocks();
    service = new UsersService(
      mocks.prisma as unknown as PrismaService,
      mocks.audit as unknown as AuditService,
    );
    mocks.prisma.user.findUnique.mockResolvedValue(user);
  });

  it('getMe throws 404 for an unknown user', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getMe(userId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateMe touches only the tables that changed', async () => {
    await service.updateMe(userId, { displayName: 'Anahit' });
    expect(mocks.prisma.profile.update).toHaveBeenCalledWith({
      where: { userId },
      data: { displayName: 'Anahit' },
    });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();

    await service.updateMe(userId, { locale: 'ru' });
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { locale: 'ru' },
    });
  });

  it('updatePreferences stores the anchor with PostGIS and completes onboarding once', async () => {
    mocks.prisma.profile.findUnique.mockResolvedValue({ onboardingCompletedAt: null });
    await service.updatePreferences(userId, {
      budgetMinAmd: 30_000_000,
      budgetMaxAmd: 60_000_000,
      preferredRooms: [2],
      priorities: { price: 1 },
      commuteAnchor: { lat: 40.18, lon: 44.51, label: 'Work' },
    });
    const updateArgs = mocks.prisma.profile.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data.budgetMinAmd).toBe(30_000_000n);
    expect(updateArgs.data.commuteAnchorLabel).toBe('Work');
    expect(updateArgs.data.onboardingCompletedAt).toBeInstanceOf(Date);
    expect(mocks.prisma.$executeRaw).toHaveBeenCalledTimes(1);

    const completed = new Date('2026-01-01T00:00:00Z');
    mocks.prisma.profile.findUnique.mockResolvedValue({ onboardingCompletedAt: completed });
    await service.updatePreferences(userId, {
      budgetMinAmd: null,
      budgetMaxAmd: null,
      preferredRooms: [],
      priorities: {},
      commuteAnchor: null,
    });
    const second = mocks.prisma.profile.update.mock.calls[1]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(second.data.onboardingCompletedAt).toBe(completed);
  });

  it('listUsers applies role, search and keyset cursor conditions', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([
      user,
      { ...user, id: otherId },
      { ...user, id: otherId },
    ]);
    const page = await service.listUsers({ limit: 2, role: 'USER', search: 'ani' });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    const args = mocks.prisma.user.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
      take: number;
    };
    expect(args.take).toBe(3);
    expect(args.where.AND).toHaveLength(2);

    await service.listUsers({ limit: 2, cursor: page.nextCursor ?? '' });
    const withCursor = mocks.prisma.user.findMany.mock.calls[1]?.[0] as {
      where: { AND: unknown[] };
    };
    expect(withCursor.where.AND).toHaveLength(1);
  });

  it('updateRole forbids self-changes, 404s unknown users and writes an audit entry', async () => {
    const actor = {
      id: userId,
      email: 'admin@example.com',
      role: 'ADMIN' as const,
      locale: 'en' as const,
    };
    await expect(service.updateRole(actor, userId, 'USER', undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    mocks.prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.updateRole(actor, otherId, 'AGENT', undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    mocks.prisma.user.update.mockResolvedValue({ ...user, id: otherId, role: 'AGENT' });
    const updated = await service.updateRole(actor, otherId, 'AGENT', '10.0.0.1');
    expect(updated.role).toBe('AGENT');
    expect(mocks.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.role.update',
        entityId: otherId,
        metadata: { from: 'USER', to: 'AGENT' },
      }),
    );
  });
});
