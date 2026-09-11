import { STREETS_BY_DISTRICT } from '../data/streets.js';
import type { SeedContext } from '../lib/context.js';

/**
 * Seeds the alias table used by the address normaliser: every street gets its
 * Armenian, Russian and English spellings mapped to one canonical English form.
 * The alias column is case-insensitive (citext), so "KOMITAS ST" also resolves.
 */
export async function seedStreetAliases(ctx: SeedContext): Promise<number> {
  const rows = new Map<
    string,
    { canonical: string; alias: string; locale: 'hy' | 'ru' | 'en' | null }
  >();

  for (const streets of Object.values(STREETS_BY_DISTRICT)) {
    for (const street of streets) {
      const canonical = `${street.en} Street`;
      const candidates: { alias: string; locale: 'hy' | 'ru' | 'en' | null }[] = [
        { alias: `${street.hy} փողոց`, locale: 'hy' },
        { alias: `${street.hy} փ.`, locale: 'hy' },
        { alias: `улица ${street.ru}`, locale: 'ru' },
        { alias: `ул. ${street.ru}`, locale: 'ru' },
        { alias: `${street.en} Street`, locale: 'en' },
        { alias: `${street.en} St`, locale: 'en' },
        { alias: `${street.en} str.`, locale: 'en' },
      ];
      for (const candidate of candidates) {
        const key = candidate.alias.toLowerCase();
        if (!rows.has(key)) {
          rows.set(key, { canonical, ...candidate });
        }
      }
    }
  }

  const result = await ctx.prisma.streetAlias.createMany({
    data: [...rows.values()],
    skipDuplicates: true,
  });
  return result.count;
}
