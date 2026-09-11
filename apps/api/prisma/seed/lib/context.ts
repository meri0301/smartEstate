import type { PrismaClient } from '../../../src/generated/prisma/client.js';
import type { Rng } from './random.js';

/** Shared state passed to every seed step. */
export interface SeedContext {
  prisma: PrismaClient;
  rng: Rng;
  /** Fixed "today" used for all generated dates. */
  referenceDate: Date;
}

export function daysBefore(date: Date, days: number, hours = 0): Date {
  return new Date(date.getTime() - days * 86_400_000 - hours * 3_600_000);
}

/** First day of the month `monthsBack` months before `date` (UTC). */
export function monthStart(date: Date, monthsBack: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - monthsBack, 1));
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
