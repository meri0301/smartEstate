import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims, AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { InjectConfig, type AppConfig } from '../../config/app-config.js';

export interface IssuedAccessToken {
  token: string;
  /** Lifetime in seconds, echoed to clients so they can schedule refreshes. */
  expiresIn: number;
}

/**
 * Access tokens are short-lived HS256 JWTs. Refresh tokens are opaque random
 * strings; only their SHA-256 hash is stored, so a database leak does not
 * yield usable sessions.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  async issueAccessToken(user: AuthenticatedUser): Promise<IssuedAccessToken> {
    const claims: AccessTokenClaims = {
      sub: user.id,
      email: user.email,
      role: user.role,
      locale: user.locale,
    };
    const token = await this.jwt.signAsync(claims, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessTtlSeconds,
    });
    return { token, expiresIn: this.config.jwt.accessTtlSeconds };
  }

  /** 384 bits of entropy, URL-safe so it survives cookie encoding untouched. */
  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  refreshTokenExpiry(now: Date = new Date()): Date {
    return new Date(now.getTime() + this.config.refreshToken.ttlDays * 86_400_000);
  }
}
