import { describe, expect, it } from 'vitest';
import { uuidV7 } from './uuid-v7.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidV7', () => {
  it('matches the RFC 9562 version-7 layout', () => {
    expect(uuidV7()).toMatch(UUID_V7);
  });

  it('sorts by timestamp', () => {
    const earlier = uuidV7(1_700_000_000_000);
    const later = uuidV7(1_700_000_000_001);
    expect(earlier < later).toBe(true);
  });

  it('is unique across many calls in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => uuidV7(1_700_000_000_000)));
    expect(ids.size).toBe(5_000);
  });
});
