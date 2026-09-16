/**
 * The landing page's artwork, exported from the Figma file and served from
 * `public/` rather than imported through the bundler.
 *
 * Every one of them is painted as a CSS background rather than an `<img>`, for
 * two reasons. They are decorative — the headline and the step headings carry
 * all of the meaning, so none of them needs alternative text — and a background
 * that fails to load leaves the surface colour behind it rather than a broken
 * image icon, which matters because these files are design exports that live
 * outside the type system and nothing would otherwise catch a rename.
 */
export const HERO_PHOTO = '/home/hero-house.jpg';

/** One line drawing per step of the "how it works" sequence. */
export const STEP_ARTWORK = {
  details: '/home/step-property-details.svg',
  analyse: '/home/step-market-analysis.svg',
  recommend: '/home/step-recommendation.svg',
} as const;

/** `url()` for a background-image, quoted so a path with spaces still parses. */
export function backgroundImage(url: string): string {
  return `url("${url}")`;
}
