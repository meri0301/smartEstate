import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  const prisma = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('reports the api service as live', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
    expect(Number.isInteger(result.uptimeSeconds)).toBe(true);
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('is ready when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.ready()).resolves.toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('returns 503 when the database does not answer', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
