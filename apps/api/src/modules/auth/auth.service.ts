import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { AuthResponse, LoginBody, RegisterBody, User } from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

/** Where the request came from; stored with the refresh token for session review. */
export interface RequestMeta {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export interface Session {
  response: AuthResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

type UserWithProfile = Prisma.UserGetPayload<{ include: { profile: true } }>;

const INVALID_CREDENTIALS = { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(body: RegisterBody, meta: RequestMeta): Promise<Session> {
    const existing = await this.prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });
    if (existing !== null) {
      throw new ConflictException({
        message: 'An account with this email already exists',
        code: 'EMAIL_TAKEN',
      });
    }
    const passwordHash = await this.passwords.hash(body.password);
    const user = await this.prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        locale: body.locale,
        profile: { create: { displayName: body.displayName } },
      },
      include: { profile: true },
    });
    return this.openSession(user, meta);
  }

  async login(body: LoginBody, meta: RequestMeta): Promise<Session> {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
      include: { profile: true },
    });
    if (user === null) {
      // Same amount of work as a real verification, so response time does not reveal which emails exist.
      await this.passwords.verifyDecoy(body.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const valid = await this.passwords.verify(user.passwordHash, body.password);
    if (!valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!user.isActive) {
      throw new UnauthorizedException({ message: 'Account is disabled', code: 'ACCOUNT_DISABLED' });
    }
    return this.openSession(user, meta);
  }

  /**
   * Rotation with reuse detection: each refresh token is single-use. Presenting
   * a token that was already rotated means it leaked (or the client replayed
   * it); the whole family is revoked so neither party keeps a session.
   */
  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<Session> {
    if (rawToken === undefined || rawToken.length === 0) {
      throw new UnauthorizedException({
        message: 'Missing refresh token',
        code: 'REFRESH_MISSING',
      });
    }
    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { profile: true } } },
    });
    if (stored === null) {
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        code: 'REFRESH_INVALID',
      });
    }
    const now = new Date();
    if (stored.revokedAt !== null) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      this.logger.warn(
        { userId: stored.userId, familyId: stored.familyId },
        'Refresh token reuse detected; family revoked',
      );
      throw new UnauthorizedException({
        message: 'Refresh token reuse detected',
        code: 'REFRESH_REUSED',
      });
    }
    if (stored.expiresAt <= now) {
      throw new UnauthorizedException({
        message: 'Refresh token expired',
        code: 'REFRESH_EXPIRED',
      });
    }
    if (!stored.user.isActive) {
      throw new UnauthorizedException({ message: 'Account is disabled', code: 'ACCOUNT_DISABLED' });
    }

    const nextToken = this.tokens.generateRefreshToken();
    const nextExpiry = this.tokens.refreshTokenExpiry(now);
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          familyId: stored.familyId,
          tokenHash: this.tokens.hashRefreshToken(nextToken),
          expiresAt: nextExpiry,
          userAgent: meta.userAgent ?? null,
          ipAddress: meta.ipAddress ?? null,
        },
        select: { id: true },
      });
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: now, replacedBy: created.id },
      });
    });

    const access = await this.tokens.issueAccessToken(toAuthenticatedUser(stored.user));
    return {
      response: {
        user: toUserDto(stored.user),
        accessToken: access.token,
        tokenType: 'Bearer',
        expiresIn: access.expiresIn,
      },
      refreshToken: nextToken,
      refreshExpiresAt: nextExpiry,
    };
  }

  /** Revokes the presented refresh token. Idempotent; unknown tokens are ignored. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken === undefined || rawToken.length === 0) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.tokens.hashRefreshToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active session of the user (all devices). */
  async logoutAll(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  private async openSession(user: UserWithProfile, meta: RequestMeta): Promise<Session> {
    const refreshToken = this.tokens.generateRefreshToken();
    const refreshExpiresAt = this.tokens.refreshTokenExpiry();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId: crypto.randomUUID(),
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ipAddress ?? null,
      },
    });
    const access = await this.tokens.issueAccessToken(toAuthenticatedUser(user));
    return {
      response: {
        user: toUserDto(user),
        accessToken: access.token,
        tokenType: 'Bearer',
        expiresIn: access.expiresIn,
      },
      refreshToken,
      refreshExpiresAt,
    };
  }
}

export function toAuthenticatedUser(user: UserWithProfile): AuthenticatedUser {
  return { id: user.id, email: user.email, role: user.role, locale: user.locale };
}

export function toUserDto(user: UserWithProfile): User {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    locale: user.locale,
    displayName: user.profile?.displayName ?? user.email,
    createdAt: user.createdAt.toISOString(),
  };
}
