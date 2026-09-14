import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { InjectConfig, type AppConfig } from '../../config/app-config.js';
import type { AccessTokenClaims } from './authenticated-user.js';
import { IS_PUBLIC_KEY } from './decorators.js';

/**
 * Global guard. Non-public routes require a valid Bearer access token; public
 * routes accept anonymous callers but still attach the user when a valid token
 * is presented, so handlers can tailor responses (e.g. an owner viewing a draft).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (token === null) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException({ message: 'Missing access token', code: 'UNAUTHENTICATED' });
    }

    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.jwt.accessSecret,
      });
      request.user = {
        id: claims.sub,
        email: claims.email,
        role: claims.role,
        locale: claims.locale,
      };
      return true;
    } catch {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException({
        message: 'Invalid or expired access token',
        code: 'UNAUTHENTICATED',
      });
    }
  }
}

export function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (
    scheme?.toLowerCase() !== 'bearer' ||
    token === undefined ||
    token.length === 0 ||
    rest.length > 0
  ) {
    return null;
  }
  return token;
}
