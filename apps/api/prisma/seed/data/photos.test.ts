import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mediaUrlSchema } from '@smartestate/contracts';
import { LISTING_PHOTOS, LISTING_PHOTO_BASE, photosFor } from './photos.js';

/** Where the web application serves `public/` from. */
const PUBLIC_DIR = fileURLToPath(new URL('../../../../web/public/listings/', import.meta.url));

describe('listing photographs', () => {
  it('produces paths the media contract accepts', () => {
    // They are app-served paths rather than absolute URLs, which the contract
    // has to allow or every seeded listing fails validation on the way out.
    for (const url of photosFor(0, LISTING_PHOTOS.length)) {
      expect(mediaUrlSchema.safeParse(url).success, url).toBe(true);
    }
  });

  it('never repeats a photograph within one listing', () => {
    // A card showing the same room three times looks like a bug in the
    // catalogue rather than a property with few pictures.
    for (let offset = 0; offset < LISTING_PHOTOS.length; offset += 1) {
      const chosen = photosFor(offset, 5);
      expect(new Set(chosen).size, `offset ${String(offset)}`).toBe(5);
    }
  });

  it('wraps rather than running off the end of the set', () => {
    const last = LISTING_PHOTOS.length - 1;
    const chosen = photosFor(last, 3);

    expect(chosen[0]).toBe(`${LISTING_PHOTO_BASE}/${LISTING_PHOTOS[last] ?? ''}`);
    expect(chosen[1]).toBe(`${LISTING_PHOTO_BASE}/${LISTING_PHOTOS[0] ?? ''}`);
  });

  it('is reproducible: the same offset gives the same photographs', () => {
    // A reseed must not change what a listing looks like, because screenshots
    // in a thesis outlive the database they came from.
    expect(photosFor(4, 4)).toEqual(photosFor(4, 4));
  });

  it('names a file that actually exists for every entry', () => {
    // The list is the contract. A name with no file behind it is a broken
    // image on every card that draws it, and nothing else would catch it.
    const missing = LISTING_PHOTOS.filter((name) => !existsSync(`${PUBLIC_DIR}${name}`));

    expect(missing, `missing from apps/web/public/listings: ${missing.join(', ')}`).toEqual([]);
  });
});
