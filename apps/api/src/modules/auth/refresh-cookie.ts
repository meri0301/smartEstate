import '@fastify/cookie'; // augments FastifyReply/FastifyRequest with cookie helpers
import { REFRESH_COOKIE_NAME } from '@smartestate/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Scoped to the auth routes so the token is never sent with ordinary API calls. */
export const REFRESH_COOKIE_PATH = '/api/auth';

export function setRefreshCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void {
  void reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(reply: FastifyReply, secure: boolean): void {
  void reply.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
}

export function readRefreshCookie(request: FastifyRequest): string | undefined {
  const value = request.cookies[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
