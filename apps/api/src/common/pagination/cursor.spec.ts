import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, toPage } from './cursor.js';

const id = '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f';

describe('cursor codec', () => {
  it('round-trips numeric and string sort values', () => {
    expect(decodeCursor(encodeCursor({ v: 45_000_000, id }))).toEqual({ v: 45_000_000, id });
    expect(decodeCursor(encodeCursor({ v: '2026-09-01T00:00:00.000Z', id }))).toEqual({
      v: '2026-09-01T00:00:00.000Z',
      id,
    });
  });

  it('is URL-safe', () => {
    expect(encodeCursor({ v: 1, id })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects garbage, non-JSON and payloads with the wrong shape', () => {
    expect(() => decodeCursor('!!!')).toThrow(BadRequestException);
    expect(() => decodeCursor(Buffer.from('not json').toString('base64url'))).toThrow(
      BadRequestException,
    );
    expect(() =>
      decodeCursor(Buffer.from(JSON.stringify({ v: 1, id: 'nope' })).toString('base64url')),
    ).toThrow(BadRequestException);
  });
});

describe('toPage', () => {
  const rows = [1, 2, 3, 4].map((n) => ({ n, id }));

  it('returns a continuation cursor only when an extra row was fetched', () => {
    const full = toPage(rows, 3, (row) => ({ v: row.n, id: row.id }));
    expect(full.items.map((r) => r.n)).toEqual([1, 2, 3]);
    expect(full.nextCursor).not.toBeNull();
    expect(decodeCursor(full.nextCursor ?? '')).toEqual({ v: 3, id });

    const last = toPage(rows.slice(0, 2), 3, (row) => ({ v: row.n, id: row.id }));
    expect(last.items).toHaveLength(2);
    expect(last.nextCursor).toBeNull();
  });

  it('handles an empty result', () => {
    expect(toPage([], 10, () => ({ v: 0, id }))).toEqual({ items: [], nextCursor: null });
  });
});
