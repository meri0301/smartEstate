import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminUser,
  AdminUsersQuery,
  CommuteAnchor,
  MeResponse,
  Page,
  PreferencesBody,
  Role,
  UpdateMeBody,
} from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { decodeCursor, toPage } from '../../common/pagination/cursor.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AuditService } from '../admin/audit.service.js';

type UserWithProfile = Prisma.UserGetPayload<{ include: { profile: true } }>;

interface AnchorRow {
  lon: number;
  lat: number;
  label: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (user === null) {
      throw new NotFoundException({ message: 'User not found', code: 'NOT_FOUND' });
    }
    return toMeResponse(user, await this.commuteAnchor(userId));
  }

  async updateMe(userId: string, body: UpdateMeBody): Promise<MeResponse> {
    const profileData: Prisma.ProfileUpdateInput = {};
    if (body.displayName !== undefined) {
      profileData.displayName = body.displayName;
    }
    if (body.phone !== undefined) {
      profileData.phone = body.phone;
    }
    await this.prisma.$transaction(async (tx) => {
      if (body.locale !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { locale: body.locale } });
      }
      if (Object.keys(profileData).length > 0) {
        await tx.profile.update({ where: { userId }, data: profileData });
      }
    });
    return this.getMe(userId);
  }

  /** Stores the onboarding quiz answers; the first save marks onboarding complete. */
  async updatePreferences(userId: string, body: PreferencesBody): Promise<MeResponse> {
    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({
        where: { userId },
        select: { onboardingCompletedAt: true },
      });
      if (profile === null) {
        throw new NotFoundException({ message: 'Profile not found', code: 'NOT_FOUND' });
      }
      await tx.profile.update({
        where: { userId },
        data: {
          budgetMinAmd: body.budgetMinAmd === null ? null : BigInt(body.budgetMinAmd),
          budgetMaxAmd: body.budgetMaxAmd === null ? null : BigInt(body.budgetMaxAmd),
          preferredRooms: body.preferredRooms,
          priorities: body.priorities,
          commuteAnchorLabel: body.commuteAnchor?.label ?? null,
          onboardingCompletedAt: profile.onboardingCompletedAt ?? new Date(),
        },
      });
      if (body.commuteAnchor === null) {
        await tx.$executeRaw`UPDATE profiles SET commute_anchor = NULL WHERE user_id = ${userId}::uuid`;
      } else {
        await tx.$executeRaw`
          UPDATE profiles
          SET commute_anchor = ST_SetSRID(
            ST_MakePoint(${body.commuteAnchor.lon}::double precision, ${body.commuteAnchor.lat}::double precision),
            4326
          )
          WHERE user_id = ${userId}::uuid`;
      }
    });
    return this.getMe(userId);
  }

  /** Administrative listing, newest first, keyset-paginated on (createdAt, id). */
  async listUsers(query: AdminUsersQuery): Promise<Page<AdminUser>> {
    const conditions: Prisma.UserWhereInput[] = [];
    if (query.role !== undefined) {
      conditions.push({ role: query.role });
    }
    if (query.search !== undefined) {
      conditions.push({
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { profile: { displayName: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor);
      const boundary = new Date(String(cursor.v));
      if (Number.isNaN(boundary.getTime())) {
        throw new BadRequestException({ message: 'Malformed cursor', code: 'INVALID_CURSOR' });
      }
      conditions.push({
        OR: [{ createdAt: { lt: boundary } }, { createdAt: boundary, id: { lt: cursor.id } }],
      });
    }

    const rows = await this.prisma.user.findMany({
      where: conditions.length > 0 ? { AND: conditions } : undefined,
      include: { profile: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toPage(rows.map(toAdminUser), query.limit, (user) => ({
      v: user.createdAt,
      id: user.id,
    }));
  }

  async updateRole(
    actor: AuthenticatedUser,
    targetId: string,
    role: Role,
    ipAddress: string | undefined,
  ): Promise<AdminUser> {
    if (actor.id === targetId) {
      throw new BadRequestException({
        message: 'Administrators cannot change their own role',
        code: 'SELF_ROLE_CHANGE',
      });
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (target === null) {
      throw new NotFoundException({ message: 'User not found', code: 'NOT_FOUND' });
    }
    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { role },
      include: { profile: true },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'user.role.update',
      entityType: 'user',
      entityId: targetId,
      metadata: { from: target.role, to: role },
      ipAddress: ipAddress ?? null,
    });
    return toAdminUser(updated);
  }

  private async commuteAnchor(userId: string): Promise<CommuteAnchor | null> {
    const rows = await this.prisma.$queryRaw<AnchorRow[]>`
      SELECT ST_X(commute_anchor) AS lon, ST_Y(commute_anchor) AS lat, commute_anchor_label AS label
      FROM profiles
      WHERE user_id = ${userId}::uuid AND commute_anchor IS NOT NULL`;
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    return { lat: row.lat, lon: row.lon, label: row.label ?? '' };
  }
}

export function toAdminUser(user: UserWithProfile): AdminUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    locale: user.locale,
    displayName: user.profile?.displayName ?? user.email,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toMeResponse(
  user: UserWithProfile,
  commuteAnchor: CommuteAnchor | null,
): MeResponse {
  const profile = user.profile;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    locale: user.locale,
    displayName: profile?.displayName ?? user.email,
    createdAt: user.createdAt.toISOString(),
    profile:
      profile === null
        ? null
        : {
            displayName: profile.displayName,
            phone: profile.phone,
            budgetMinAmd: profile.budgetMinAmd === null ? null : Number(profile.budgetMinAmd),
            budgetMaxAmd: profile.budgetMaxAmd === null ? null : Number(profile.budgetMaxAmd),
            preferredRooms: profile.preferredRooms,
            priorities: asPriorities(profile.priorities),
            commuteAnchor,
            onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
          },
  };
}

function asPriorities(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}
