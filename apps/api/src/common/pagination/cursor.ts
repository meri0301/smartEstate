import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Keyset ("seek") pagination cursor: the sort value and id of the last row on
 * the previous page. Opaque to clients (base64url JSON), validated on decode so
 * a tampered cursor yields a 400 rather than a database error.
 */
export const cursorPayloadSchema = z.object({
  /** Sort column value of the boundary row (number, or ISO string for dates). */
  v: z.union([z.number(), z.string()]),
  /** Tie-breaker: the boundary row id. */
  id: z.uuid(),
});
export type CursorPayload = z.infer<typeof cursorPayloadSchema>;

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException({ message: 'Malformed cursor', code: 'INVALID_CURSOR' });
  }
  const result = cursorPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new BadRequestException({ message: 'Malformed cursor', code: 'INVALID_CURSOR' });
  }
  return result.data;
}

/**
 * Splits `limit + 1` fetched rows into the page and its continuation cursor.
 * Fetching one extra row is how keyset pagination learns whether more exist.
 */
export function toPage<T>(
  rows: readonly T[],
  limit: number,
  cursorOf: (row: T) => CursorPayload,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : [...rows];
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last !== undefined ? encodeCursor(cursorOf(last)) : null,
  };
}
