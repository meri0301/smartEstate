import { randomBytes } from 'node:crypto';

/**
 * RFC 9562 UUIDv7: 48-bit Unix millisecond timestamp + 74 random bits.
 * Prisma applies `uuid(7)` defaults only in Prisma Client calls; rows inserted
 * with raw SQL (needed for PostGIS geometry) generate their ids here so the
 * whole table keeps time-ordered, index-friendly keys.
 */
export function uuidV7(timestampMs: number = Date.now()): string {
  const bytes = randomBytes(16);
  const ts = BigInt(timestampMs);
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  // Version 7 in the high nibble of byte 6, RFC variant (10xx) in byte 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
