/**
 * Helpers for query-string parameters, which arrive as strings (or arrays of
 * strings when a key is repeated) and must be coerced before validation.
 */
import { z } from 'zod';

/**
 * Accepts `?key=a,b`, `?key=a&key=b` or both, yielding a validated list.
 * The input side of the schema stays representable in OpenAPI (string | string[]).
 */
export function csvList<T extends z.ZodType>(
  item: T,
  { max = 20 }: { max?: number } = {},
): z.ZodType<z.output<T>[], string | string[]> {
  // The item schema validates each split string; the cast only narrows the input side to string[].
  const list = z.array(item).min(1).max(max) as unknown as z.ZodType<z.output<T>[], string[]>;
  return z
    .union([z.string(), z.array(z.string())])
    .transform((value: string | string[]) =>
      (Array.isArray(value) ? value : [value])
        .flatMap((part) => part.split(','))
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    )
    .pipe(list);
}

/** Boolean flag in a query string: only the literal strings "true" / "false". */
export const queryBooleanSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const queryIntSchema = z.coerce.number().int();
export const queryNumberSchema = z.coerce.number();
