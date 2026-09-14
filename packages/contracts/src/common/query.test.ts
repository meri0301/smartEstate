import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { pageSchema, paginationQuerySchema } from './pagination.js';
import { csvList, queryBooleanSchema } from './query.js';

describe('csvList', () => {
  const schema = csvList(z.enum(['a', 'b', 'c']), { max: 2 });

  it('splits comma-separated values and trims whitespace', () => {
    expect(schema.parse(' a , b')).toEqual(['a', 'b']);
  });

  it('flattens repeated parameters that themselves contain commas', () => {
    expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('enforces the maximum number of items', () => {
    expect(schema.safeParse('a,b,c').success).toBe(false);
  });

  it('rejects an empty list', () => {
    expect(schema.safeParse(' , ').success).toBe(false);
  });
});

describe('queryBooleanSchema', () => {
  it('accepts only the literal strings true and false', () => {
    expect(queryBooleanSchema.parse('true')).toBe(true);
    expect(queryBooleanSchema.parse('false')).toBe(false);
    expect(queryBooleanSchema.safeParse('1').success).toBe(false);
    expect(queryBooleanSchema.safeParse('yes').success).toBe(false);
  });
});

describe('pagination', () => {
  it('defaults the limit and accepts an optional cursor', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(paginationQuerySchema.parse({ limit: '10', cursor: 'abc' })).toEqual({
      limit: 10,
      cursor: 'abc',
    });
  });

  it('builds a page envelope around an item schema', () => {
    const page = pageSchema(z.object({ id: z.string() }));
    expect(page.safeParse({ items: [{ id: 'x' }], nextCursor: null }).success).toBe(true);
    expect(page.safeParse({ items: [{ id: 1 }], nextCursor: null }).success).toBe(false);
  });
});
