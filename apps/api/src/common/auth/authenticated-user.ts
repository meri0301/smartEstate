import type { Locale, Role } from '@smartestate/contracts';

/** Identity attached to the request by `JwtAuthGuard` after verifying the access token. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  locale: Locale;
}

/** Claims carried by the access token. `sub` is the user id. */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: Role;
  locale: Locale;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
