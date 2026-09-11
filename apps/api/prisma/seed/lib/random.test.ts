import { describe, expect, it } from 'vitest';
import { createRng } from './random.js';

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());

    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);

    expect(a.next()).not.toBe(b.next());
  });

  it('keeps next() inside [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int() is inclusive on both bounds and covers the range', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i += 1) {
      const value = rng.int(2, 5);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(5);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('int() rejects an inverted range', () => {
    expect(() => createRng(1).int(5, 2)).toThrow(RangeError);
  });

  it('weighted() never returns zero-weight entries and respects proportions', () => {
    const rng = createRng(11);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng.weighted([
        ['a', 3],
        ['b', 1],
        ['c', 0],
      ] as const);
      counts[value] += 1;
    }
    expect(counts.c).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.5);
    expect(counts.a / counts.b).toBeLessThan(3.5);
  });

  it('pick() throws on an empty list', () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });

  it('normal() has the requested mean and spread', () => {
    const rng = createRng(5);
    const samples = Array.from({ length: 20_000 }, () => rng.normal(100, 15));
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;

    expect(mean).toBeCloseTo(100, 0);
    expect(Math.sqrt(variance)).toBeCloseTo(15, 0);
  });

  it('shuffle() returns a permutation without mutating the input', () => {
    const rng = createRng(9);
    const input = [1, 2, 3, 4, 5, 6];
    const output = rng.shuffle(input);

    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...output].sort((x, y) => x - y)).toEqual(input);
  });
});
