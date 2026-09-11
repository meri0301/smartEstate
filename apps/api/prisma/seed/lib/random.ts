/**
 * Deterministic pseudo-random helpers for the seed.
 *
 * The seed must be reproducible: the same seed number yields the same 300
 * listings on every machine, so thesis evaluation numbers can be re-derived.
 * mulberry32 is a small, well-distributed 32-bit generator that needs no
 * dependency.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  float(min: number, max: number): number;
  /** Bernoulli trial with probability `probability`. */
  chance(probability: number): boolean;
  /** Uniformly chosen element. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;
  /** Element chosen proportionally to its weight. Zero-weight entries are never chosen. */
  weighted<T>(entries: readonly (readonly [value: T, weight: number])[]): T;
  /** Normally distributed sample (Box–Muller). */
  normal(mean: number, standardDeviation: number): number;
  /** Multiplicative noise: exp(N(0, sigma)), median 1. */
  logNormalFactor(sigma: number): number;
  /** Fisher–Yates shuffle into a new array. */
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) {
      throw new RangeError(`int(): max (${String(max)}) is smaller than min (${String(min)})`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  const float = (min: number, max: number): number => min + next() * (max - min);

  const chance = (probability: number): boolean => next() < probability;

  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)];
    if (item === undefined) {
      throw new RangeError('pick(): cannot pick from an empty list');
    }
    return item;
  };

  const weighted = <T>(entries: readonly (readonly [T, number])[]): T => {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (total <= 0) {
      throw new RangeError('weighted(): total weight must be positive');
    }
    let threshold = next() * total;
    for (const [value, weight] of entries) {
      if (weight <= 0) {
        continue;
      }
      threshold -= weight;
      if (threshold < 0) {
        return value;
      }
    }
    // Floating-point tail: return the last positive-weight entry.
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry !== undefined && entry[1] > 0) {
        return entry[0];
      }
    }
    throw new RangeError('weighted(): no entry with positive weight');
  };

  const normal = (mean: number, standardDeviation: number): number => {
    let u1 = next();
    while (u1 === 0) {
      u1 = next();
    }
    const u2 = next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * standardDeviation;
  };

  const logNormalFactor = (sigma: number): number => Math.exp(normal(0, sigma));

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      const a = copy[i];
      const b = copy[j];
      if (a !== undefined && b !== undefined) {
        copy[i] = b;
        copy[j] = a;
      }
    }
    return copy;
  };

  return { next, int, float, chance, pick, weighted, normal, logNormalFactor, shuffle };
}
