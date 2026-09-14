import {
  createParamDecorator,
  SetMetadata,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Role } from '@smartestate/contracts';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from './authenticated-user.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/** Route is reachable without an access token. A valid token, if present, is still attached. */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Route requires one of the given roles (checked after authentication). */
export const Roles = (...roles: readonly Role[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user, or `undefined` on public routes without a token. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<FastifyRequest>().user,
);
