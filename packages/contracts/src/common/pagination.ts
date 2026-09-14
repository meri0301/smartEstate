import { z } from 'zod';

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;

/** Opaque keyset cursor produced by the API; clients never construct it. */
export const cursorSchema = z.string().min(1).max(512);

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  cursor: cursorSchema.optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Wraps an item schema into the standard page envelope. */
export function pageSchema<T extends z.ZodType>(
  item: T,
): z.ZodObject<{ items: z.ZodArray<T>; nextCursor: z.ZodNullable<z.ZodString> }> {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
