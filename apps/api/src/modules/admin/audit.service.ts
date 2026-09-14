import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

export interface AuditEntry {
  /** Acting user, or null for system actions. */
  actorId: string | null;
  /** Dotted verb, e.g. "user.role.update", "listing.create". */
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/** Append-only record of privileged and state-changing actions. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }
}
