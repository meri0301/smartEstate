import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@smartestate/contracts';
import type { FastifyRequest } from 'fastify';
import { ROLES_KEY } from './decorators.js';

/** Role-based access control; runs after `JwtAuthGuard` has attached the user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<readonly Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed === undefined || allowed.length === 0) {
      return true;
    }
    const user = context.switchToHttp().getRequest<FastifyRequest>().user;
    if (user === undefined) {
      throw new ForbiddenException({ message: 'Authentication required', code: 'FORBIDDEN' });
    }
    if (!allowed.includes(user.role)) {
      throw new ForbiddenException({ message: 'Insufficient role', code: 'FORBIDDEN' });
    }
    return true;
  }
}
