/**
 * The photographs the seeded catalogue uses.
 *
 * Files served by the web application from `apps/web/public/listings/`, not a
 * remote placeholder service. Three reasons the imagery is local.
 *
 * It has to look like housing. The previous source, `picsum.photos`, returns a
 * random photograph of anything for a given seed, so the catalogue showed
 * frost, industrial silos and open sea. There is no way to ask it for
 * apartments: its catalogue carries no keywords. Tag-based services were tried
 * and are worse than they sound — `apartment,interior` on Flickr returns a door
 * handle, a shop floor and a sign reading "BICYCLE STORAGE", because the tags
 * are written by whoever uploaded the picture.
 *
 * It has to work with no internet. The project runs on `docker compose up` and
 * nothing else; a catalogue whose every photograph is a remote fetch is a
 * catalogue that is blank on a train.
 *
 * And it has to be stable. A reseed should not silently change what a listing
 * looks like, because screenshots in a thesis outlive the database they came
 * from.
 */

/**
 * Filenames in `apps/web/public/listings/`.
 *
 * Adding one widens the rotation with no other change. The list is the contract
 * — a file that is not named here is never used, and a name here with no file
 * behind it is a broken image, which the seed's own test guards against.
 */
export const LISTING_PHOTOS: readonly string[] = [
  'apartment-01.webp',
  'apartment-02.webp',
  'apartment-03.webp',
  'apartment-04.webp',
  'apartment-05.webp',
  'apartment-06.webp',
  'apartment-07.webp',
  'apartment-08.webp',
  'apartment-09.webp',
  'apartment-10.webp',
  'apartment-11.webp',
  'apartment-12.webp',
];

/** Where the web application serves them from. */
export const LISTING_PHOTO_BASE = '/listings';

/**
 * The photographs for one listing, as app-served paths.
 *
 * Consecutive from an offset rather than drawn independently, so a listing
 * never shows the same photograph twice while the set is larger than the number
 * of photographs asked for. The offset comes from the caller's seeded generator,
 * which is what keeps a reseed reproducible.
 */
export function photosFor(offset: number, count: number): string[] {
  const total = LISTING_PHOTOS.length;
  if (total === 0) {
    throw new RangeError('LISTING_PHOTOS is empty; the catalogue would have no imagery');
  }
  return Array.from({ length: count }, (_, index) => {
    const name = LISTING_PHOTOS[(offset + index) % total];
    return `${LISTING_PHOTO_BASE}/${name ?? ''}`;
  });
}
